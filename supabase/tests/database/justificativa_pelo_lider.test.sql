-- Líder registra a justificativa por um integrante; histórico guarda quem fez e quando.
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

select plan(9);

insert into auth.users (id, email) values
  ('a4000000-0000-4000-8000-000000000001', 'lider@teste.local'),
  ('a4000000-0000-4000-8000-000000000002', 'thayna@teste.local');

select pg_temp.entrar_como('a4000000-0000-4000-8000-000000000001');
select public.create_church('Igreja Teste');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja Teste';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'a4000000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a4000000-0000-4000-8000-000000000002');
insert into ids select 'thayna', id from ministry_members where user_id = 'a4000000-0000-4000-8000-000000000002';

-- culto que já passou, com falta lançada
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto Passado', now() - interval '1 day');
insert into ids select 'culto', id from events where title = 'Culto Passado';
insert into point_ledger (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, note)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'),
       public.cycle_for_event((select v from ids where k = 'culto')),
       (select v from ids where k = 'thayna'), -20, 'absence', (select v from ids where k = 'culto'), 'Falta sem aviso'
where public.cycle_for_event((select v from ids where k = 'culto')) is not null;

-- a própria pessoa não pode usar a função do líder
select pg_temp.entrar_como('a4000000-0000-4000-8000-000000000002');
select throws_ok(
  format($$select public.leader_register_justification(%L, %L, 'absence', 'Hospital')$$,
    (select v from ids where k = 'culto'), (select v from ids where k = 'thayna')),
  '42501', null, 'integrante não registra pelo líder');
-- e depois do evento não envia aviso pelo app
select throws_ok(
  format($$insert into justifications (church_id, event_id, ministry_member_id, kind, reason) values (%L, %L, %L, 'absence', 'Hospital')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'thayna')),
  '42501', null, 'depois do evento o integrante não envia aviso');
reset role;

select pg_temp.entrar_como('a4000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$select public.leader_register_justification(%L, %L, 'absence', 'Estava no hospital')$$,
    (select v from ids where k = 'culto'), (select v from ids where k = 'thayna')),
  'líder registra a justificativa depois do evento');
reset role;

select is((select status::text from justifications where ministry_member_id = (select v from ids where k = 'thayna')),
  'approved', 'já entra aprovada');
select is((select created_by from justifications where ministry_member_id = (select v from ids where k = 'thayna')),
  'a4000000-0000-4000-8000-000000000001'::uuid, 'guarda quem registrou');
select is((select coalesce(sum(delta), 0)::int from point_ledger
           where ministry_member_id = (select v from ids where k = 'thayna') and event_id = (select v from ids where k = 'culto')),
  0, 'desconto de falta devolvido');
select is((select array_agg(action order by at, action desc) from justification_log
           where ministry_member_id = (select v from ids where k = 'thayna')),
  array['created_by_leader', 'approved'], 'histórico: registrado pelo líder e aprovado');

-- a integrante vê o próprio histórico
select pg_temp.entrar_como('a4000000-0000-4000-8000-000000000002');
select is((select count(*)::int from justification_log), 2, 'integrante vê o próprio histórico');
select throws_ok(
  format($$insert into justification_log (church_id, action) values (%L, 'approved')$$, (select v from ids where k = 'church')),
  '42501', null, 'cliente não escreve no histórico');
reset role;

select * from finish();
rollback;
