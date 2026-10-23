-- Fase 7 — funções escolhidas pelo membro, disponibilidade, forma do ponto e Web Push.
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

select plan(21);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'lider@f7.local', '{"full_name": "Líder Sete"}'),
  ('a7000000-0000-4000-8000-000000000002', 'membro@f7.local', '{"full_name": "Membro Sete"}'),
  ('a7000000-0000-4000-8000-000000000003', 'outro@f7.local', '{"full_name": "Outro Sete"}');

select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F7');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja F7';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into ministries (church_id, name) values ((select v from ids where k = 'church'), 'Mídia');
insert into ids select 'midia', id from ministries where name = 'Mídia' and church_id = (select v from ids where k = 'church');
insert into ministry_roles (church_id, ministry_id, name)
values ((select v from ids where k = 'church'), (select v from ids where k = 'midia'), 'Câmera');
insert into ids select 'role_camera', id from ministry_roles where name = 'Câmera' and ministry_id = (select v from ids where k = 'midia');
insert into ids select 'role_violao', id from ministry_roles where ministry_id = (select v from ids where k = 'louvor') order by name limit 1;

insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array['a7000000-0000-4000-8000-000000000002'::uuid, 'a7000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array['a7000000-0000-4000-8000-000000000002'::uuid, 'a7000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ids select 'm_membro', id from ministry_members where user_id = 'a7000000-0000-4000-8000-000000000002';
insert into ids select 'm_outro', id from ministry_members where user_id = 'a7000000-0000-4000-8000-000000000003';

insert into events (church_id, ministry_id, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Culto F7', now() + interval '10 days');
insert into ids select 'evento', id from events where title = 'Culto F7';

-- -----------------------------------------------------------------------------
-- Funções: o membro escolhe as dele
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000002');
select lives_ok(
  format('insert into ministry_member_roles (church_id, ministry_member_id, ministry_role_id) values (%L, %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'm_membro'), (select v from ids where k = 'role_violao')),
  'membro escolhe a própria função');
select throws_ok(
  format('insert into ministry_member_roles (church_id, ministry_member_id, ministry_role_id) values (%L, %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'm_outro'), (select v from ids where k = 'role_violao')),
  '42501', null, 'membro não escolhe função de outra pessoa');
select throws_ok(
  format('insert into ministry_member_roles (church_id, ministry_member_id, ministry_role_id) values (%L, %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'm_membro'), (select v from ids where k = 'role_camera')),
  '22023', null, 'função de outro ministério é recusada');
select lives_ok(
  format('delete from ministry_member_roles where ministry_member_id = %L', (select v from ids where k = 'm_membro')),
  'membro tira a própria função');
select is((select count(*)::int from ministry_member_roles where ministry_member_id = (select v from ids where k = 'm_membro')), 0,
  'função removida');

-- -----------------------------------------------------------------------------
-- Disponibilidade
-- -----------------------------------------------------------------------------
select lives_ok(
  format('insert into event_availability (church_id, event_id, ministry_member_id, available) values (%L, %L, %L, true)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'm_membro')),
  'membro diz que pode');
select lives_ok(
  format('update event_availability set available = false where ministry_member_id = %L', (select v from ids where k = 'm_membro')),
  'membro muda a resposta');
select throws_ok(
  format('insert into event_availability (church_id, event_id, ministry_member_id, available) values (%L, %L, %L, true)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'm_outro')),
  '42501', null, 'membro não responde por outra pessoa');
reset role;

insert into event_availability (church_id, event_id, ministry_member_id, available)
values ((select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'm_outro'), true);

select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000002');
select is((select count(*)::int from event_availability where event_id = (select v from ids where k = 'evento')), 1,
  'membro só vê a própria resposta');
reset role;

select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000001');
select is((select count(*)::int from event_availability where event_id = (select v from ids where k = 'evento')), 2,
  'líder vê as respostas da equipe');
select lives_ok(
  format('update ministry_settings set checkin_mode = %L, availability_starts_on = current_date, availability_ends_on = current_date + 90 where ministry_id = %L',
    'geo', (select v from ids where k = 'louvor')),
  'líder escolhe a forma do ponto e o período');
select throws_ok(
  format('update ministry_settings set checkin_mode = %L where ministry_id = %L', 'magica', (select v from ids where k = 'louvor')),
  '23514', null, 'forma do ponto inválida é recusada');
reset role;

select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000002');
update ministry_settings set checkin_mode = 'qr' where ministry_id = (select v from ids where k = 'louvor');
reset role;
select is((select checkin_mode from ministry_settings where ministry_id = (select v from ids where k = 'louvor')), 'geo',
  'membro não muda a forma do ponto');

-- -----------------------------------------------------------------------------
-- Web Push
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000002');
select lives_ok(
  $$select public.save_push_subscription('https://push.example/abc', 'p256', 'auth', 'teste')$$,
  'membro ativa o aviso no celular');
select throws_ok(
  $$insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values ('a7000000-0000-4000-8000-000000000003', 'https://push.example/x', 'a', 'b')$$,
  '42501', null, 'ninguém grava aparelho direto na tabela');
reset role;

-- o mesmo aparelho, agora com outra conta, passa a ser dela
select pg_temp.entrar_como('a7000000-0000-4000-8000-000000000003');
select public.save_push_subscription('https://push.example/abc', 'p256', 'auth', 'teste');
select is((select count(*)::int from push_subscriptions), 1, 'cada um vê só os próprios aparelhos');
reset role;
select is((select profile_id from push_subscriptions where endpoint = 'https://push.example/abc'),
  'a7000000-0000-4000-8000-000000000003'::uuid, 'aparelho troca de dono ao trocar de conta');

-- Sem telefone, mas com aviso no celular: entra na fila (não é pulado)
set local role service_role;
select public.record_attendance((select v from ids where k = 'evento'), (select v from ids where k = 'm_outro'), now(), 25, -10, 'geo');
reset role;
select is((select status::text from notification_queue where kind = 'points_deducted' and profile_id = 'a7000000-0000-4000-8000-000000000003'), 'pending',
  'quem só tem aviso no celular fica na fila');
select is((select status::text from notification_queue where profile_id = 'a7000000-0000-4000-8000-000000000002'), null,
  '(membro sem desconto não recebe nada)');

set local role service_role;
create temporary table claimed on commit drop as select * from public.claim_notifications(100);
reset role;
select ok((select profile_id = 'a7000000-0000-4000-8000-000000000003' and phone is null and not push_sent from claimed where kind = 'points_deducted'),
  'envio recebe a pessoa, sem telefone, e se o celular já recebeu');
select is((select source::text from checkins where ministry_member_id = (select v from ids where k = 'm_outro')), 'geo',
  'ponto pela localização fica registrado como tal');

select * from finish();
rollback;
