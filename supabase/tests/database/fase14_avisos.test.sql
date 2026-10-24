-- Fase 14 — avisos programados de culto e ensaio e "confirmar presença".
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.entrar_como(p_uid uuid)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$fn$;

select plan(11);

insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-000000000001', 'lider@f14.local'),
  ('ae000000-0000-4000-8000-000000000002', 'membro@f14.local'),
  ('ae000000-0000-4000-8000-000000000003', 'faltou@f14.local');
update profiles set phone = '(11) 90000-0000' where id::text like 'ae000000-%';

select pg_temp.entrar_como('ae000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F14');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F14';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');

select is((select count(*)::int from reminder_rules where ministry_id = (select v from ids where k = 'louvor')), 5,
  'ministério novo já vem com os avisos padrão');
select is(
  reminder_fire_at('weekday', 1::smallint, null, '09:00', null, '2026-11-01T22:00:00Z', null, 'America/Sao_Paulo'),
  '2026-10-26T12:00:00Z'::timestamptz, 'segunda 9h antes do culto de domingo');

-- regras determinísticas para o teste: culto 1 h antes; ensaio 40 min antes, só no celular
update reminder_rules set enabled = false where ministry_id = (select v from ids where k = 'louvor');
insert into reminder_rules (church_id, ministry_id, event_kind, timing, minutes_before, push_only) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'minutes_before', 60, false),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'minutes_before', 40, true);

insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'ae000000-0000-4000-8000-000000000002'::uuid, 'ae000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'ae000000-0000-4000-8000-000000000002'::uuid, 'ae000000-0000-4000-8000-000000000003'::uuid]) u;

insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F14', now() + interval '50 minutes');
insert into ids select 'culto', id from events where title = 'Culto F14';
insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio F14',
        now() + interval '30 minutes', (select v from ids where k = 'culto'));
insert into ids select 'ensaio', id from events where title = 'Ensaio F14';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'culto'), id from ministry_members
where user_id in ('ae000000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000003');
insert into justifications (church_id, event_id, ministry_member_id, kind, reason)
select (select v from ids where k = 'church'), (select v from ids where k = 'culto'), id, 'absence', 'Plantão'
from ministry_members where user_id = 'ae000000-0000-4000-8000-000000000003';

select public.enqueue_reminders();
select is((select count(*)::int from notification_queue where kind = 'event_reminder'
           and profile_id = 'ae000000-0000-4000-8000-000000000002'), 2, 'integrante recebe aviso do culto e do ensaio');
select is((select payload ->> 'path' from notification_queue where kind = 'event_reminder'
           and profile_id = 'ae000000-0000-4000-8000-000000000002' and payload ->> 'kind' = 'rehearsal'),
  '/confirmar/' || (select v from ids where k = 'culto'), 'o aviso do ensaio leva para confirmar o culto');
select is((select (payload ->> 'pushOnly')::boolean from notification_queue where kind = 'event_reminder'
           and payload ->> 'kind' = 'rehearsal' and profile_id = 'ae000000-0000-4000-8000-000000000002'), true,
  'regra "só no celular" vai no aviso');
select is((select count(*)::int from notification_queue where kind = 'event_reminder'
           and profile_id = 'ae000000-0000-4000-8000-000000000003' and payload ->> 'kind' = 'service'), 0,
  'quem avisou falta no culto não recebe lembrete dele');
select public.enqueue_reminders();
select is((select count(*)::int from notification_queue where kind = 'event_reminder'
           and profile_id = 'ae000000-0000-4000-8000-000000000002'), 2, 'rodar de novo não repete');

-- Confirmar presença vale para culto e ensaio
select pg_temp.entrar_como('ae000000-0000-4000-8000-000000000002');
select is(public.confirm_my_presence((select v from ids where k = 'ensaio')), 2, 'confirma culto e ensaio de uma vez');
reset role;
select is((select count(*)::int from schedule_assignments sa join ministry_members mm on mm.id = sa.ministry_member_id
           where mm.user_id = 'ae000000-0000-4000-8000-000000000002' and sa.status = 'confirmed'), 2,
  'as duas escalas ficam confirmadas');

select pg_temp.entrar_como('ae000000-0000-4000-8000-000000000001');
select throws_ok(format('select public.confirm_my_presence(%L)', (select v from ids where k = 'culto')),
  'Você não está na escala deste culto', 'quem não está na escala não confirma');
reset role;

-- Integrante não mexe nas regras
select pg_temp.entrar_como('ae000000-0000-4000-8000-000000000002');
update reminder_rules set enabled = true where ministry_id = (select v from ids where k = 'louvor');
reset role;
select is((select count(*)::int from reminder_rules where ministry_id = (select v from ids where k = 'louvor') and enabled), 2,
  'integrante não altera os avisos');

select * from finish();
rollback;
