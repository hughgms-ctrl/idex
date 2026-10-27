-- Fase 28 — ensaios separados por função (banda e vozes).
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

select plan(16);

insert into auth.users (id, email) values
  ('a2800000-0000-4000-8000-000000000001', 'lider@f28.local'),
  ('a2800000-0000-4000-8000-000000000002', 'baixo@f28.local'),
  ('a2800000-0000-4000-8000-000000000003', 'vocal@f28.local');

select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000001');
select public.create_church('Igreja F28');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F28';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into ministry_roles (church_id, ministry_id, name)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Baixo F28'),
       ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Vocal F28');
insert into ids select 'r_baixo', id from ministry_roles where name = 'Baixo F28';
insert into ids select 'r_vocal', id from ministry_roles where name = 'Vocal F28';
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u
from unnest(array['a2800000-0000-4000-8000-000000000002', 'a2800000-0000-4000-8000-000000000003']::uuid[]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u
from unnest(array['a2800000-0000-4000-8000-000000000002', 'a2800000-0000-4000-8000-000000000003']::uuid[]) u;
insert into ids select 'baixo', id from ministry_members where user_id = 'a2800000-0000-4000-8000-000000000002';
insert into ids select 'vocal', id from ministry_members where user_id = 'a2800000-0000-4000-8000-000000000003';

-- Líder cria os grupos; integrante não
select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000001');
select lives_ok(
  format($$insert into rehearsal_groups (church_id, ministry_id, name, role_ids) values (%L, %L, 'Ensaio da banda', array[%L]::uuid[]), (%L, %L, 'Ensaio de vozes', array[%L]::uuid[])$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'r_baixo'),
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'r_vocal')),
  'líder cria os ensaios de banda e de vozes');
reset role;
insert into ids select 'g_banda', id from rehearsal_groups where name = 'Ensaio da banda';
insert into ids select 'g_vozes', id from rehearsal_groups where name = 'Ensaio de vozes';

select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000002');
select is((select count(*)::int from rehearsal_groups where ministry_id = (select v from ids where k = 'louvor')), 2,
  'integrante vê os grupos');
select throws_ok(
  format($$insert into rehearsal_groups (church_id, ministry_id, name) values (%L, %L, 'Meu ensaio')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor')),
  '42501', null, 'integrante não cria grupo');
reset role;

-- Culto com baixo e vocal; os dois ensaios
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F28', now() + interval '5 days');
insert into ids select 'culto', id from events where title = 'Culto F28';
insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'baixo'), (select v from ids where k = 'r_baixo')),
       ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'vocal'), (select v from ids where k = 'r_vocal'));

select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000001');
select lives_ok(
  format($$insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id, rehearsal_group_id) values (%L, %L, 'rehearsal', 'Banda F28', now() + interval '2 days', %L, %L), (%L, %L, 'rehearsal', 'Vozes F28', now() + interval '3 days', %L, %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto'), (select v from ids where k = 'g_banda'),
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto'), (select v from ids where k = 'g_vozes')),
  'um culto pode ter um ensaio por grupo');
select throws_ok(
  format($$insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id, rehearsal_group_id) values (%L, %L, 'rehearsal', 'Banda 2', now() + interval '1 day', %L, %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto'), (select v from ids where k = 'g_banda')),
  '23505', null, 'só um ensaio de cada grupo por culto');
reset role;
insert into ids select 'banda', id from events where title = 'Banda F28';
insert into ids select 'vozes', id from events where title = 'Vozes F28';

select results_eq(
  format($$select ministry_member_id from schedule_assignments where event_id = %L$$, (select v from ids where k = 'banda')),
  format($$values (%L::uuid)$$, (select v from ids where k = 'baixo')),
  'ensaio da banda só tem o baixo');
select results_eq(
  format($$select ministry_member_id from schedule_assignments where event_id = %L$$, (select v from ids where k = 'vozes')),
  format($$values (%L::uuid)$$, (select v from ids where k = 'vocal')),
  'ensaio de vozes só tem o vocal');

-- Espelho: nova escala no culto vai só ao ensaio da função
insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'baixo'), (select v from ids where k = 'r_vocal'));
select is((select count(*)::int from schedule_assignments
           where event_id = (select v from ids where k = 'vozes') and ministry_member_id = (select v from ids where k = 'baixo')), 1,
  'quem também canta entra no ensaio de vozes');
select is((select count(*)::int from schedule_assignments
           where event_id = (select v from ids where k = 'banda') and ministry_member_id = (select v from ids where k = 'baixo')), 1,
  'e continua no da banda (uma vez)');

-- Trocar a função no culto troca de ensaio
update schedule_assignments set ministry_role_id = (select v from ids where k = 'r_baixo')
where event_id = (select v from ids where k = 'culto') and ministry_member_id = (select v from ids where k = 'vocal');
select is((select count(*)::int from schedule_assignments
           where event_id = (select v from ids where k = 'vozes') and ministry_member_id = (select v from ids where k = 'vocal')), 0,
  'mudou para baixo: sai do ensaio de vozes');
select is((select count(*)::int from schedule_assignments
           where event_id = (select v from ids where k = 'banda') and ministry_member_id = (select v from ids where k = 'vocal')), 1,
  'e entra no da banda');

-- Escalado sem função vai aos dois
update schedule_assignments set ministry_role_id = null
where event_id = (select v from ids where k = 'culto') and ministry_member_id = (select v from ids where k = 'vocal');
select is((select count(*)::int from schedule_assignments
           where event_id in ((select v from ids where k = 'banda'), (select v from ids where k = 'vozes'))
             and ministry_member_id = (select v from ids where k = 'vocal')), 2,
  'sem função: vai aos dois ensaios');
update schedule_assignments set ministry_role_id = (select v from ids where k = 'r_vocal')
where event_id = (select v from ids where k = 'culto') and ministry_member_id = (select v from ids where k = 'vocal');

-- Líder muda as funções do grupo: o ensaio futuro se acerta
select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000001');
update rehearsal_groups set role_ids = array[(select v from ids where k = 'r_baixo'), (select v from ids where k = 'r_vocal')]
where id = (select v from ids where k = 'g_banda');
reset role;
select is((select count(distinct ministry_member_id)::int from schedule_assignments where event_id = (select v from ids where k = 'banda')), 2,
  'vocal incluído no grupo da banda entra no ensaio');
select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000001');
update rehearsal_groups set role_ids = array[(select v from ids where k = 'r_baixo')]
where id = (select v from ids where k = 'g_banda');
reset role;
select is((select count(*)::int from schedule_assignments
           where event_id = (select v from ids where k = 'banda') and ministry_role_id = (select v from ids where k = 'r_vocal')), 0,
  'tirou o vocal do grupo: sai do ensaio');

-- Falta: o vocal não leva falta no ensaio da banda (não está nele)
select is((select count(*)::int from schedule_assignments
           where event_id = (select v from ids where k = 'banda') and ministry_member_id = (select v from ids where k = 'vocal')), 0,
  'vocal não está escalado no ensaio da banda');

-- Apagar o grupo apaga os ensaios futuros dele
select pg_temp.entrar_como('a2800000-0000-4000-8000-000000000001');
delete from rehearsal_groups where id = (select v from ids where k = 'g_vozes');
reset role;
select is((select count(*)::int from events where id = (select v from ids where k = 'vozes')), 0,
  'apagar o grupo apaga o ensaio futuro dele');

select * from finish();
rollback;
