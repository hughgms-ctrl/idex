-- Fase 4 — presença, pedidos, faltas e fechamento de ciclo.
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

select plan(27);

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'lider@f4.local'),
  ('f0000000-0000-4000-8000-000000000002', 'm1@f4.local'),
  ('f0000000-0000-4000-8000-000000000003', 'm2@f4.local'),
  ('f0000000-0000-4000-8000-000000000004', 'm3@f4.local');

select pg_temp.entrar_como('f0000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F4');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja F4';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');

insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'f0000000-0000-4000-8000-000000000002'::uuid, 'f0000000-0000-4000-8000-000000000003'::uuid,
  'f0000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'f0000000-0000-4000-8000-000000000002'::uuid, 'f0000000-0000-4000-8000-000000000003'::uuid,
  'f0000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ids select 'm1', id from ministry_members where user_id = 'f0000000-0000-4000-8000-000000000002';
insert into ids select 'm2', id from ministry_members where user_id = 'f0000000-0000-4000-8000-000000000003';
insert into ids select 'm3', id from ministry_members where user_id = 'f0000000-0000-4000-8000-000000000004';

-- Evento de 3 dias atrás (fora do prazo de 48h) e evento de 1h atrás
insert into events (church_id, ministry_id, title, starts_at, ends_at) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Antigo', now() - interval '3 days', now() - interval '3 days' + interval '2 hours'),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Recente', now() - interval '1 hour', now() + interval '1 hour'),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Futuro', now() + interval '1 day', null);
insert into ids select 'antigo', id from events where title = 'Antigo' and church_id = (select v from ids where k = 'church');
insert into ids select 'recente', id from events where title = 'Recente' and church_id = (select v from ids where k = 'church');
insert into ids select 'futuro', id from events where title = 'Futuro' and church_id = (select v from ids where k = 'church');
-- o evento antigo pertence ao ciclo aberto (que começou hoje): recua o início
update cycles set starts_on = current_date - 10 where ministry_id = (select v from ids where k = 'louvor');

insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), e.v, m.v
from (select v from ids where k in ('antigo', 'recente', 'futuro')) e,
     (select v from ids where k in ('m1', 'm2', 'm3')) m;

-- m2 justificou o evento antigo (aprovado); m3 fez check-in nele
insert into justifications (church_id, event_id, ministry_member_id, kind, reason, status)
values ((select v from ids where k = 'church'), (select v from ids where k = 'antigo'), (select v from ids where k = 'm2'), 'absence', 'Viagem', 'approved');

-- -----------------------------------------------------------------------------
-- Gravação de presença só pelo servidor
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como('f0000000-0000-4000-8000-000000000004');
select throws_ok(
  format('select public.record_attendance(%L, %L, now(), 0, 0, %L)', (select v from ids where k = 'antigo'), (select v from ids where k = 'm3'), 'qr'),
  '42501', null, 'membro não chama a gravação de presença');
select throws_ok('select public.process_absences()', '42501', null, 'membro não roda o job de faltas');
select throws_ok('select public.close_due_cycles()', '42501', null, 'membro não fecha ciclo');
reset role;

set local role service_role;
select lives_ok(
  format('select public.record_attendance(%L, %L, now() - interval %L, 15, -5, %L, -23.5, -46.6, 12, 40)',
    (select v from ids where k = 'antigo'), (select v from ids where k = 'm3'), '3 days', 'qr'),
  'servidor grava check-in com atraso');
reset role;
select is((select delta from point_ledger where reason = 'late' and ministry_member_id = (select v from ids where k = 'm3')), -5,
  'atraso gera lançamento no ledger');
select throws_ok(
  format('select public.record_attendance(%L, %L, now(), 0, 0, %L)', (select v from ids where k = 'antigo'), (select v from ids where k = 'm3'), 'qr'),
  '23505', null, 'não registra presença duas vezes');
select throws_ok(
  format('select public.record_attendance(%L, %L, now(), 0, 5, %L)', (select v from ids where k = 'futuro'), (select v from ids where k = 'm3'), 'qr'),
  '22023', null, 'presença nunca soma pontos');

-- -----------------------------------------------------------------------------
-- Faltas automáticas
-- -----------------------------------------------------------------------------
select lives_ok('select public.process_absences()', 'job de faltas roda');
select is((select count(*)::int from point_ledger where reason = 'absence' and ministry_id = (select v from ids where k = 'louvor')), 1, 'só quem faltou sem aviso no evento vencido perde pontos');
select is((select delta from point_ledger where reason = 'absence' and ministry_id = (select v from ids where k = 'louvor')), -20, 'falta sem aviso: −20');
select is((select ministry_member_id from point_ledger where reason = 'absence' and ministry_id = (select v from ids where k = 'louvor')), (select v from ids where k = 'm1'), 'a falta é do m1');
select public.process_absences();
select is((select count(*)::int from point_ledger where reason = 'absence' and ministry_id = (select v from ids where k = 'louvor')), 1, 'rodar de novo não duplica');
select is((select count(*)::int from point_ledger where ministry_member_id = (select v from ids where k = 'm2') and reason <> 'cycle_start'), 0,
  'justificativa aprovada: sem desconto');

-- -----------------------------------------------------------------------------
-- Pedido "esqueci de registrar"
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como('f0000000-0000-4000-8000-000000000002');
select throws_ok(
  format('select public.create_checkin_request(%L, now(), %L)', (select v from ids where k = 'futuro'), 'esqueci'),
  '22023', 'O evento ainda não começou', 'pedido antes do evento é recusado');
select throws_ok(
  format('select public.create_checkin_request(%L, now() - interval %L, %L)', (select v from ids where k = 'antigo'), '3 days', 'esqueci'),
  '22023', null, 'pedido depois de 48h é recusado');
select lives_ok(
  format('select public.create_checkin_request(%L, now() - interval %L, %L)', (select v from ids where k = 'recente'), '55 minutes', 'Celular sem bateria'),
  'pedido dentro do prazo é aceito');
select is((select status::text from checkin_requests), 'pending', 'pedido fica pendente');
reset role;
insert into ids select 'req', id from checkin_requests where ministry_member_id = (select v from ids where k = 'm1');

-- Membro não aprova o próprio pedido; líder decide pela função do servidor
select pg_temp.entrar_como('f0000000-0000-4000-8000-000000000002');
select throws_ok('update checkin_requests set status = ''approved''', '42501', null, 'membro não aprova o próprio pedido');
reset role;

set local role service_role;
select lives_ok(
  format('select public.apply_checkin_request_review(%L, %L, now() - interval %L, 0, -20, %L)',
    (select v from ids where k = 'req'), 'rejected', '55 minutes', 'f0000000-0000-4000-8000-000000000001'),
  'líder recusa o pedido');
reset role;
select is((select delta from point_ledger where reason = 'request_rejected' and ministry_member_id = (select v from ids where k = 'm1')), -20, 'pedido recusado vira falta');

-- -----------------------------------------------------------------------------
-- Justificativa: só o líder decide
-- -----------------------------------------------------------------------------
insert into justifications (church_id, event_id, ministry_member_id, kind, reason)
values ((select v from ids where k = 'church'), (select v from ids where k = 'futuro'), (select v from ids where k = 'm1'), 'late', 'Trânsito');
insert into ids select 'just_late', id from justifications where kind = 'late';
select pg_temp.entrar_como('f0000000-0000-4000-8000-000000000003');
select throws_ok(
  format('select public.review_justification(%L, true)', (select v from ids where k = 'just_late')),
  '42501', null, 'membro não decide justificativa de outro');
reset role;
select pg_temp.entrar_como('f0000000-0000-4000-8000-000000000001');
select lives_ok(
  format('select public.review_justification(%L, true, %L)', (select v from ids where k = 'just_late'), 'ok'),
  'líder aprova justificativa');
reset role;

-- -----------------------------------------------------------------------------
-- Fechamento de ciclo
-- -----------------------------------------------------------------------------
-- Ciclo terminou ontem: vira "fechando" e o próximo abre com saldo cheio
update cycles set ends_on = current_date - 1 where ministry_id = (select v from ids where k = 'louvor');
select lives_ok('select public.close_due_cycles()', 'job de ciclos roda');
select is((select status::text from cycles where ministry_id = (select v from ids where k = 'louvor') and ends_on = current_date - 1), 'closing', 'no primeiro dia ainda não fecha (prazo dos pedidos)');
select is(
  (select count(*)::int from point_ledger pl join cycles c on c.id = pl.cycle_id
   where c.status = 'open' and c.ministry_id = (select v from ids where k = 'louvor') and pl.reason = 'cycle_start'),
  4, 'novo ciclo aberto com saldo cheio para os 4 integrantes');

-- Prazo passou: calcula elegibilidade (m1: 100 − 20 − 20 = 60 < 70)
update cycles set ends_on = current_date - 5, starts_on = current_date - 30 where status = 'closing' and ministry_id = (select v from ids where k = 'louvor');
select public.close_due_cycles();
select is((select status::text from cycles where ministry_id = (select v from ids where k = 'louvor') and ends_on = current_date - 5), 'closed', 'ciclo fechado depois do prazo');
select results_eq(
  format('select ministry_member_id, balance, eligible from cycle_eligibility where ministry_id = %L and ministry_member_id in (%L, %L) order by balance',
    (select v from ids where k = 'louvor'), (select v from ids where k = 'm1'), (select v from ids where k = 'm3')),
  format('values (%L::uuid, 60, false), (%L::uuid, 95, true)', (select v from ids where k = 'm1'), (select v from ids where k = 'm3')),
  'saldo abaixo do mínimo fica inelegível; acima, elegível');

select * from finish();
rollback;
