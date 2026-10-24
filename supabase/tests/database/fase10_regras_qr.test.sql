-- Fase 10 — quem fica de fora pela regra de horário e QR fixo.
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

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aa000000-0000-4000-8000-000000000001', 'lider@f10.local', '{"full_name": "Líder Dez"}'),
  ('aa000000-0000-4000-8000-000000000002', 'membro@f10.local', '{"full_name": "Membro Dez"}');
update profiles set phone = '(11) 90000-0000' where id in ('aa000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002');

select pg_temp.entrar_como('aa000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F10');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja F10';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'aa000000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'aa000000-0000-4000-8000-000000000002');
insert into ids select 'membro', id from ministry_members where user_id = 'aa000000-0000-4000-8000-000000000002';
update ministry_settings set rehearsal_late_consequence = 'out_rehearsal_and_service' where ministry_id = (select v from ids where k = 'louvor');

-- culto em 3 dias, ensaio que já acabou (há 3 horas)
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F10', now() + interval '3 days');
insert into ids select 'culto', id from events where title = 'Culto F10';
insert into events (church_id, ministry_id, kind, title, starts_at, ends_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio F10',
        now() - interval '5 hours', now() - interval '3 hours', (select v from ids where k = 'culto'));
insert into ids select 'ensaio', id from events where title = 'Ensaio F10';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'membro'));

select is((select count(*)::int from schedule_assignments where event_id = (select v from ids where k = 'ensaio')), 1, 'membro está no ensaio (espelho)');

-- Faltou ao ensaio → fora do culto, logo depois do ensaio
set local role service_role;
select public.process_absences();
reset role;
select is((select status::text from schedule_assignments where event_id = (select v from ids where k = 'culto')), 'benched',
  'faltou ao ensaio: fica de fora do culto');
select is((select count(*)::int from schedule_assignments where event_id = (select v from ids where k = 'ensaio')), 1,
  'ficar de fora do culto não apaga o ensaio');
select is((select count(*)::int from notification_queue where kind = 'member_benched' and profile_id = 'aa000000-0000-4000-8000-000000000002'), 1,
  'a pessoa é avisada');
select is((select count(*)::int from notification_queue where kind = 'member_benched' and profile_id = 'aa000000-0000-4000-8000-000000000001'), 1,
  'o líder é avisado para chamar substituto');
set local role service_role;
select public.process_absences();
reset role;
select is((select count(*)::int from notification_queue where kind = 'member_benched'), 2, 'rodar de novo não repete');

-- Devolver à escala (pedido aprovado depois)
set local role service_role;
select public.apply_late_consequence((select v from ids where k = 'ensaio'), (select v from ids where k = 'membro'), 'none');
reset role;
select is((select status::text from schedule_assignments where event_id = (select v from ids where k = 'culto')), 'scheduled',
  'aprovado: volta para a escala');

-- Membro não chama a regra
select pg_temp.entrar_como('aa000000-0000-4000-8000-000000000002');
select throws_ok(
  format($$select public.apply_late_consequence(%L, %L, 'event')$$, (select v from ids where k = 'culto'), (select v from ids where k = 'membro')),
  '42501', null, 'membro não tira ninguém da escala');
-- QR fixo
select ok((select checkin_code ~ '^[0-9a-f]{24}$' from ministry_settings where ministry_id = (select v from ids where k = 'louvor')),
  'ministério tem código fixo de QR');
select throws_ok(
  format($$select public.regenerate_checkin_code(%L)$$, (select v from ids where k = 'louvor')),
  '42501', null, 'membro não troca o QR');
reset role;

select pg_temp.entrar_como('aa000000-0000-4000-8000-000000000001');
create temporary table antes on commit drop as select checkin_code from ministry_settings where ministry_id = (select v from ids where k = 'louvor');
select lives_ok(format($$select public.regenerate_checkin_code(%L)$$, (select v from ids where k = 'louvor')), 'líder gera QR novo');
select isnt((select checkin_code from ministry_settings where ministry_id = (select v from ids where k = 'louvor')), (select checkin_code from antes),
  'o código mudou (o QR antigo deixa de valer)');
reset role;

select * from finish();
rollback;
