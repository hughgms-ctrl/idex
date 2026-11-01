-- Período de teste: ninguém fica de fora; os pontos continuam valendo.
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

select plan(7);

insert into auth.users (id, email) values
  ('a3000000-0000-4000-8000-000000000001', 'lider@teste.local'),
  ('a3000000-0000-4000-8000-000000000002', 'pablo@teste.local');

select pg_temp.entrar_como('a3000000-0000-4000-8000-000000000001');
select public.create_church('Igreja Teste');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja Teste';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'a3000000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3000000-0000-4000-8000-000000000002');
insert into ids select 'pablo', id from ministry_members where user_id = 'a3000000-0000-4000-8000-000000000002';

-- culto hoje à noite; ensaio já passou
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto Teste', now() + interval '3 hours');
insert into ids select 'culto', id from events where title = 'Culto Teste';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'pablo'));

-- sem teste: a regra tira do culto
select is(public.apply_late_consequence((select v from ids where k = 'culto'), (select v from ids where k = 'pablo'), 'event', 'Atrasou'),
  1, 'sem período de teste a regra tira da escala');

-- líder liga o período de teste: quem estava de fora volta
select pg_temp.entrar_como('a3000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$update ministry_settings set rules_trial = true where ministry_id = %L$$, (select v from ids where k = 'louvor')),
  'líder liga o período de teste');
reset role;
select is((select status::text from schedule_assignments where event_id = (select v from ids where k = 'culto')), 'scheduled',
  'quem tinha ficado de fora volta para a escala');

select is(public.apply_late_consequence((select v from ids where k = 'culto'), (select v from ids where k = 'pablo'), 'event_and_service', 'Faltou'),
  0, 'no período de teste ninguém fica de fora');
select is((select status::text from schedule_assignments where event_id = (select v from ids where k = 'culto')), 'scheduled',
  'continua escalado');

-- pontos continuam valendo
select lives_ok(
  format($$insert into point_ledger (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, note)
           select %L, %L, public.cycle_for_event(%L), %L, -5, 'late', %L, 'Atraso'$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto'),
    (select v from ids where k = 'pablo'), (select v from ids where k = 'culto')),
  'lançamento de atraso entra');
select is((select count(*)::int from point_ledger where ministry_member_id = (select v from ids where k = 'pablo') and reason = 'late'), 1,
  'no período de teste o atraso desconta normalmente');

select * from finish();
rollback;
