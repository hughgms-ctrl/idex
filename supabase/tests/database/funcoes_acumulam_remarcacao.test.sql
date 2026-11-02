-- Funções que acumulam (cantar + tocar no mesmo culto) e data da remarcação.
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

select plan(8);

insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-000000000001', 'lider@acumula.local'),
  ('ae000000-0000-4000-8000-000000000002', 'membro@acumula.local'),
  ('ae000000-0000-4000-8000-000000000003', 'outro@acumula.local');
update profiles set phone = '(11) 90000-0000'
where id in ('ae000000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000003');

select pg_temp.entrar_como('ae000000-0000-4000-8000-000000000001');
select public.create_church('Igreja Acumula');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja Acumula';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'ae000000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000003']::uuid[]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'ae000000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000003']::uuid[]) u;
insert into ids select 'membro', id from ministry_members where user_id = 'ae000000-0000-4000-8000-000000000002';
insert into ids select 'outro', id from ministry_members where user_id = 'ae000000-0000-4000-8000-000000000003';

insert into ministry_roles (church_id, ministry_id, name, can_combine) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Vocal A', true),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Violão A', false),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Guitarra A', false);
insert into ids select 'vocal', id from ministry_roles where name = 'Vocal A';
insert into ids select 'violao', id from ministry_roles where name = 'Violão A';
insert into ids select 'guitarra', id from ministry_roles where name = 'Guitarra A';

insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service',
        'Culto Acumula', now() + interval '6 days');
insert into ids select 'culto', id from events where title = 'Culto Acumula';

select is((select rescheduled_at from events where id = (select v from ids where k = 'culto')), null,
  'evento novo não tem remarcação');

insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'),
        (select v from ids where k = 'membro'), (select v from ids where k = 'violao'));

select lives_ok(
  format($$insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id) values (%L, %L, %L, %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'culto'),
    (select v from ids where k = 'membro'), (select v from ids where k = 'vocal')),
  'quem toca violão também pode cantar');

select throws_ok(
  format($$insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id) values (%L, %L, %L, %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'culto'),
    (select v from ids where k = 'membro'), (select v from ids where k = 'guitarra')),
  '23514', null, 'dois instrumentos no mesmo culto, não');

-- o outro integrante disse que não pode (antes de o culto mudar)
insert into event_availability (church_id, event_id, ministry_member_id, available)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'),
        (select v from ids where k = 'outro'), false);

-- mudar só o título não conta como remarcação
update events set title = 'Culto Acumula!' where id = (select v from ids where k = 'culto');
select is((select rescheduled_at from events where id = (select v from ids where k = 'culto')), null,
  'mudar o título não marca remarcação');

select pg_temp.entrar_como('ae000000-0000-4000-8000-000000000001');
update events set starts_at = starts_at + interval '1 day' where id = (select v from ids where k = 'culto');
reset role;

select isnt((select rescheduled_at from events where id = (select v from ids where k = 'culto')), null,
  'mudar o dia marca a remarcação');
select is((select count(*)::int from notification_queue where kind = 'event_rescheduled'
           and profile_id = 'ae000000-0000-4000-8000-000000000002'), 1,
  'quem está escalado (em duas funções) recebe um aviso só');
select is((select count(*)::int from notification_queue where kind = 'event_rescheduled'
           and profile_id = 'ae000000-0000-4000-8000-000000000003'), 1,
  'quem respondeu a disponibilidade do culto também é avisado');
select is((select payload ->> 'path' from notification_queue where kind = 'event_rescheduled' limit 1),
  '/confirmar/' || (select v from ids where k = 'culto'),
  'o aviso leva para revisar a disponibilidade');

select * from finish();
rollback;
