-- Fase 9 — horário de chegada e ensaio de cada culto.
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
  ('a9000000-0000-4000-8000-000000000001', 'lider@f9.local'),
  ('a9000000-0000-4000-8000-000000000002', 'membro@f9.local');

select pg_temp.entrar_como('a9000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F9');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F9';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into ids select 'role', id from ministry_roles where ministry_id = (select v from ids where k = 'louvor') order by name limit 1;
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'a9000000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a9000000-0000-4000-8000-000000000002');
insert into ids select 'membro', id from ministry_members where user_id = 'a9000000-0000-4000-8000-000000000002';

-- Culto daqui a 5 dias, chegada 30 min antes
select pg_temp.entrar_como('a9000000-0000-4000-8000-000000000001');
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F9',
        now() + interval '5 days', now() + interval '5 days' - interval '30 minutes');
reset role;
insert into ids select 'culto', id from events where title = 'Culto F9';

select throws_ok(
  format($$update events set arrive_at = starts_at + interval '5 minutes' where id = %L$$, (select v from ids where k = 'culto')),
  '23514', null, 'chegada depois do início é recusada');

-- Escala no culto antes de existir o ensaio
insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'membro'), (select v from ids where k = 'role'));

select pg_temp.entrar_como('a9000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id) values (%L, %L, 'rehearsal', 'Ensaio F9', now() + interval '2 days', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto')),
  'líder cria o ensaio do culto');
reset role;
insert into ids select 'ensaio', id from events where title = 'Ensaio F9';

select is((select count(*)::int from schedule_assignments where event_id = (select v from ids where k = 'ensaio')), 1,
  'quem já estava no culto entra no ensaio');
select throws_ok(
  format($$insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id) values (%L, %L, 'rehearsal', 'Outro ensaio', now() + interval '3 days', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto')),
  '23505', null, 'só um ensaio por culto');
select throws_ok(
  format($$update events set starts_at = now() + interval '6 days' where id = %L$$, (select v from ids where k = 'ensaio')),
  '22023', 'O ensaio precisa ser antes do culto', 'ensaio depois do culto é recusado');
select throws_ok(
  format($$insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id) values (%L, %L, 'service', 'Culto ligado', now() + interval '1 day', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'culto')),
  '23514', null, 'só ensaio pode apontar para um culto');

-- Espelho: troca e remoção no culto valem para o ensaio
update schedule_assignments set ministry_role_id = null
where event_id = (select v from ids where k = 'culto');
select is((select ministry_role_id from schedule_assignments where event_id = (select v from ids where k = 'ensaio')), null,
  'mudança de função no culto vai para o ensaio');
delete from schedule_assignments where event_id = (select v from ids where k = 'culto');
select is((select count(*)::int from schedule_assignments where event_id = (select v from ids where k = 'ensaio')), 0,
  'tirar do culto tira do ensaio');

-- Apagar o culto apaga o ensaio
delete from events where id = (select v from ids where k = 'culto');
select is((select count(*)::int from events where id = (select v from ids where k = 'ensaio')), 0, 'apagar o culto apaga o ensaio');

-- "Esqueci de registrar" usa o horário de chegada
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at, ends_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto agora',
        now() + interval '20 minutes', now() - interval '10 minutes', now() + interval '2 hours');
insert into ids select 'agora', id from events where title = 'Culto agora';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'agora'), (select v from ids where k = 'membro'));
select pg_temp.entrar_como('a9000000-0000-4000-8000-000000000002');
select lives_ok(
  format($$select public.create_checkin_request(%L, now() - interval '5 minutes', 'Esqueci o celular')$$, (select v from ids where k = 'agora')),
  'pedido aceito depois da chegada, mesmo antes do início do culto');
reset role;

-- Líder define os padrões
select pg_temp.entrar_como('a9000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$update ministry_settings set service_arrival_minutes = 45, rehearsal_days_before = 2, rehearsal_time = '19:30' where ministry_id = %L$$,
    (select v from ids where k = 'louvor')),
  'líder ajusta chegada e ensaio padrão');
reset role;

select * from finish();
rollback;
