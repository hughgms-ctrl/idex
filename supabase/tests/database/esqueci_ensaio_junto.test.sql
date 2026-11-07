-- "Esqueci de registrar" com o ensaio junto do culto (mesma chegada): um pedido
-- vale para os dois — aprovado registra presença nos dois e desconta uma vez;
-- recusado vira uma falta só; sem pedido, cada um leva a sua falta.
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
  ('c2000000-0000-4000-8000-000000000001', 'lider@junto.local'),
  ('c2000000-0000-4000-8000-000000000002', 'aprovado@junto.local'),
  ('c2000000-0000-4000-8000-000000000003', 'recusado@junto.local'),
  ('c2000000-0000-4000-8000-000000000004', 'sumiu@junto.local');

select pg_temp.entrar_como('c2000000-0000-4000-8000-000000000001');
select public.create_church('Igreja Junto');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja Junto';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
update cycles set starts_on = (now() at time zone 'America/Sao_Paulo')::date - 10
where ministry_id = (select v from ids where k = 'louvor');
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'c2000000-0000-4000-8000-000000000002'::uuid, 'c2000000-0000-4000-8000-000000000003'::uuid,
  'c2000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'c2000000-0000-4000-8000-000000000002'::uuid, 'c2000000-0000-4000-8000-000000000003'::uuid,
  'c2000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ids select 'aprovado', id from ministry_members where user_id = 'c2000000-0000-4000-8000-000000000002';
insert into ids select 'recusado', id from ministry_members where user_id = 'c2000000-0000-4000-8000-000000000003';
insert into ids select 'sumiu', id from ministry_members where user_id = 'c2000000-0000-4000-8000-000000000004';

-- Culto às 09:30 com chegada 07:40; ensaio às 08:00 com a MESMA chegada
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at, ends_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto Junto',
        now() - interval '4 hours', now() - interval '5 hours 50 minutes', now() - interval '2 hours');
insert into ids select 'culto', id from events where title = 'Culto Junto';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'culto'), v
from ids where k in ('aprovado', 'recusado', 'sumiu');
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at, ends_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio Junto',
        now() - interval '5 hours 30 minutes', now() - interval '5 hours 50 minutes', now() - interval '4 hours',
        (select v from ids where k = 'culto'));
insert into ids select 'ensaio', id from events where title = 'Ensaio Junto';
-- garante a equipe no ensaio (o espelho do culto já costuma copiar)
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), i.v
from ids i
where i.k in ('aprovado', 'recusado', 'sumiu')
  and not exists (select 1 from schedule_assignments sa
                  where sa.event_id = (select v from ids where k = 'ensaio') and sa.ministry_member_id = i.v);

select ok(public.events_joint((select v from ids where k = 'culto'), (select v from ids where k = 'ensaio')),
  'culto e ensaio com a mesma chegada estão juntos');

-- Pedidos "esqueci" no culto
select pg_temp.entrar_como('c2000000-0000-4000-8000-000000000002');
select public.create_checkin_request((select v from ids where k = 'culto'), now() - interval '5 hours 30 minutes', 'Celular sem bateria');
select throws_ok(
  format('select public.create_checkin_request(%L, now() - interval %L, %L)',
         (select v from ids where k = 'ensaio'), '5 hours 30 minutes', 'de novo'),
  '22023', null, 'não precisa pedir de novo no ensaio: o pedido do culto já vale');
reset role;
select pg_temp.entrar_como('c2000000-0000-4000-8000-000000000003');
select public.create_checkin_request((select v from ids where k = 'culto'), now() - interval '5 hours', 'Esqueci');
reset role;

-- Líder: aprova um (atrasado: −5) e recusa o outro (falta: −20)
set local role service_role;
select public.apply_checkin_request_review(
  (select id from checkin_requests where ministry_member_id = (select v from ids where k = 'aprovado')),
  'approved', now() - interval '5 hours 30 minutes', 20, -5, 'c2000000-0000-4000-8000-000000000001');
select public.apply_checkin_request_review(
  (select id from checkin_requests where ministry_member_id = (select v from ids where k = 'recusado')),
  'rejected', null, 0, -20, 'c2000000-0000-4000-8000-000000000001');
reset role;

create function pg_temp.descontos(p_k text) returns int language sql as $$
  select coalesce(sum(delta), 0)::int from point_ledger
  where ministry_member_id = (select v from ids where k = p_k) and reason <> 'cycle_start'
$$;

select is((select count(*)::int from checkins where ministry_member_id = (select v from ids where k = 'aprovado')), 2,
  'aprovado: presença registrada no culto e no ensaio');
select is((select late_minutes from checkins where ministry_member_id = (select v from ids where k = 'aprovado')
           and event_id = (select v from ids where k = 'ensaio')), 20, 'o ensaio guarda o mesmo atraso');
select is(pg_temp.descontos('aprovado'), -5, 'aprovado: o atraso desconta uma vez só');

-- Passa o prazo dos pedidos: o job de faltas roda
update events set starts_at = starts_at - interval '3 days', arrive_at = arrive_at - interval '3 days',
                  ends_at = ends_at - interval '3 days'
where id in ((select v from ids where k = 'culto'), (select v from ids where k = 'ensaio'));
set local role service_role;
select public.process_absences();
reset role;

select is(pg_temp.descontos('recusado'), -20, 'recusado: uma falta só (o ensaio junto não leva outra)');
select is(pg_temp.descontos('sumiu'), -40, 'sem pedido: falta no culto e no ensaio, como antes');
select is(pg_temp.descontos('aprovado'), -5, 'aprovado: o job não lança nada a mais');
select ok(not public.events_joint((select v from ids where k = 'culto'), (select v from ids where k = 'culto')),
  'um evento não está "junto" de si mesmo');

select * from finish();
rollback;
