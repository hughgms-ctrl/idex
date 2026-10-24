-- Fase 15 — disponibilidade para o ensaio (por culto).
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

select plan(5);

insert into auth.users (id, email) values
  ('af000000-0000-4000-8000-000000000001', 'lider@f15.local'),
  ('af000000-0000-4000-8000-000000000002', 'membro@f15.local'),
  ('af000000-0000-4000-8000-000000000003', 'outro@f15.local');

select pg_temp.entrar_como('af000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F15');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F15';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'af000000-0000-4000-8000-000000000002'::uuid, 'af000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'af000000-0000-4000-8000-000000000002'::uuid, 'af000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ids select 'membro', id from ministry_members where user_id = 'af000000-0000-4000-8000-000000000002';
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F15', now() + interval '6 days');
insert into ids select 'culto', id from events where title = 'Culto F15';

select pg_temp.entrar_como('af000000-0000-4000-8000-000000000002');
select lives_ok(format($$insert into rehearsal_availability (church_id, event_id, ministry_member_id, status, note)
  values (%L, %L, %L, 'some', 'Só terça; quarta não')$$,
  (select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'membro')),
  'integrante diz em que dias pode ensaiar');
select lives_ok(format($$update rehearsal_availability set status = 'none', note = 'Viajando a semana toda' where ministry_member_id = %L$$,
  (select v from ids where k = 'membro')), 'e muda depois');
reset role;

select pg_temp.entrar_como('af000000-0000-4000-8000-000000000003');
select is((select count(*)::int from rehearsal_availability), 0, 'outro integrante não vê a resposta');
select throws_ok(format($$insert into rehearsal_availability (church_id, event_id, ministry_member_id, status)
  values (%L, %L, %L, 'any')$$,
  (select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'membro')),
  '42501', null, 'nem responde por ele');
reset role;

select pg_temp.entrar_como('af000000-0000-4000-8000-000000000001');
select is((select status || ': ' || note from rehearsal_availability), 'none: Viajando a semana toda', 'líder vê a resposta');
reset role;

select * from finish();
rollback;
