-- =============================================================================
-- Testes de isolamento (RLS) — rodar com `supabase test db` (pgTAP).
--
-- Cenário: duas igrejas (A e B), cada uma criada pelo seu dono via RPC, e um
-- membro comum na igreja A. Tudo roda numa transação que é desfeita no fim.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Simula o usuário logado como o PostgREST faz (papel + claims do JWT)
create function pg_temp.entrar_como(p_uid uuid, p_email text)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$fn$;

create function pg_temp.entrar_como_anonimo()
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  set local role anon;
end;
$fn$;

select plan(45);

-- -----------------------------------------------------------------------------
-- Preparação (como postgres)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'dono.a@teste.local',   '{"full_name": "Dono A"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'membro.a@teste.local', '{"full_name": "Membro A"}'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'dono.b@teste.local',   '{"full_name": "Dono B"}'),
  ('cccccccc-0000-4000-8000-000000000001', 'novo@teste.local',     '{"full_name": "Novo"}');

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, anon;

-- Dono A cria a igreja A
select pg_temp.entrar_como('aaaaaaaa-0000-4000-8000-000000000001', 'dono.a@teste.local');
select isnt(public.create_church('Igreja A'), null, 'dono A cria a igreja A pela RPC');
reset role;

-- Dono B cria a igreja B
select pg_temp.entrar_como('bbbbbbbb-0000-4000-8000-000000000001', 'dono.b@teste.local');
select isnt(public.create_church('Igreja B'), null, 'dono B cria a igreja B pela RPC');
reset role;

insert into ids
select 'church_a', id from churches where name = 'Igreja A'
union all select 'church_b', id from churches where name = 'Igreja B'
union all select 'min_a', m.id from ministries m join churches c on c.id = m.church_id where c.name = 'Igreja A'
union all select 'min_b', m.id from ministries m join churches c on c.id = m.church_id where c.name = 'Igreja B';

-- Membro comum entra na igreja A (como faria o accept_invite)
insert into church_members (church_id, user_id, role)
values ((select v from ids where k = 'church_a'), 'aaaaaaaa-0000-4000-8000-000000000002', 'member');
insert into ministry_members (church_id, ministry_id, user_id, role)
values ((select v from ids where k = 'church_a'), (select v from ids where k = 'min_a'),
        'aaaaaaaa-0000-4000-8000-000000000002', 'member');

-- Um evento e uma música na igreja B
insert into events (church_id, ministry_id, title, starts_at)
values ((select v from ids where k = 'church_b'), (select v from ids where k = 'min_b'), 'Culto B', now() + interval '2 days');
insert into songs (church_id, ministry_id, title)
values ((select v from ids where k = 'church_b'), (select v from ids where k = 'min_b'), 'Música B');
-- Um evento futuro na igreja A
insert into events (church_id, ministry_id, title, starts_at)
values ((select v from ids where k = 'church_a'), (select v from ids where k = 'min_a'), 'Culto A', now() + interval '2 days');
insert into ids select 'event_a', id from events where title = 'Culto A';
insert into ids select 'event_b', id from events where title = 'Culto B';
insert into ids
select 'mm_member_a', id from ministry_members where user_id = 'aaaaaaaa-0000-4000-8000-000000000002';

-- -----------------------------------------------------------------------------
-- Estrutura: RLS ativada e com policy em TODAS as tabelas do schema public
-- -----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'todas as tabelas de public têm RLS ativada');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  0, 'todas as tabelas de public têm ao menos uma policy');

-- -----------------------------------------------------------------------------
-- Igreja A não LÊ dados da igreja B
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como('aaaaaaaa-0000-4000-8000-000000000001', 'dono.a@teste.local');

select results_eq('select name from churches', array['Igreja A'], 'dono A só enxerga a própria igreja');
select is((select count(*)::int from ministries where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê ministérios da igreja B');
select is((select count(*)::int from ministry_members where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê membros da igreja B');
select is((select count(*)::int from events where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê eventos da igreja B');
select is((select count(*)::int from songs where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê músicas da igreja B');
select is((select count(*)::int from point_ledger where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê pontos da igreja B');
select is((select count(*)::int from cycles where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê ciclos da igreja B');
select is((select count(*)::int from ministry_settings where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê configurações da igreja B');
select is((select count(*)::int from profiles where id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0,
  'dono A não vê o perfil do dono B');
select is((select count(*)::int from audit_log where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê a auditoria da igreja B');
select is((select count(*)::int from member_cycle_balance where church_id = (select v from ids where k = 'church_b')), 0,
  'dono A não vê saldos da igreja B (view)');

-- -----------------------------------------------------------------------------
-- Igreja A não ESCREVE dados da igreja B
-- -----------------------------------------------------------------------------
select throws_ok(
  format('insert into events (church_id, ministry_id, title, starts_at) values (%L, %L, %L, now())',
         (select v from ids where k = 'church_b'), (select v from ids where k = 'min_b'), 'Invasão'),
  '42501', null, 'dono A não cria evento na igreja B');

select throws_ok(
  format('insert into events (church_id, ministry_id, title, starts_at) values (%L, %L, %L, now())',
         (select v from ids where k = 'church_a'), (select v from ids where k = 'min_b'), 'Mistura'),
  null, null, 'evento com church_id de A e ministério de B é recusado');

select throws_ok(
  format('insert into songs (church_id, ministry_id, title) values (%L, %L, %L)',
         (select v from ids where k = 'church_b'), (select v from ids where k = 'min_b'), 'Invasão'),
  '42501', null, 'dono A não cria música na igreja B');

select throws_ok(
  format('insert into invites (church_id, ministry_id, created_by) values (%L, %L, %L)',
         (select v from ids where k = 'church_b'), (select v from ids where k = 'min_b'),
         'aaaaaaaa-0000-4000-8000-000000000001'),
  '42501', null, 'dono A não cria convite para a igreja B');

select throws_ok(
  format('insert into ministries (church_id, name) values (%L, %L)', (select v from ids where k = 'church_b'), 'Invasão'),
  '42501', null, 'dono A não cria ministério na igreja B');

select results_eq(
  format('with u as (update churches set name = %L where id = %L returning 1) select count(*)::int from u',
         'Hackeada', (select v from ids where k = 'church_b')),
  array[0], 'dono A não altera a igreja B');

select results_eq(
  format('with d as (delete from songs where church_id = %L returning 1) select count(*)::int from d',
         (select v from ids where k = 'church_b')),
  array[0], 'dono A não apaga músicas da igreja B');

select results_eq(
  format('with u as (update ministry_settings set absence_penalty = 0 where church_id = %L returning 1) select count(*)::int from u',
         (select v from ids where k = 'church_b')),
  array[0], 'dono A não altera configurações da igreja B');

-- Dono/líder também não escreve pontos nem check-in direto
select throws_ok(
  format('insert into point_ledger (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason) select church_id, ministry_id, cycle_id, ministry_member_id, 50, %L from point_ledger limit 1',
         'cycle_start'),
  '42501', null, 'nem o líder insere em point_ledger pelo cliente');

reset role;

-- -----------------------------------------------------------------------------
-- Membro comum: não escreve em point_ledger / checkins / ciclos
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como('aaaaaaaa-0000-4000-8000-000000000002', 'membro.a@teste.local');

select is((select count(*)::int from point_ledger), 1, 'membro só vê o próprio lançamento de pontos');
select is((select balance from member_cycle_balance), 100, 'membro que entra no meio do ciclo começa com saldo cheio');

select throws_ok(
  format('insert into point_ledger (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason) select church_id, ministry_id, cycle_id, ministry_member_id, 50, %L from point_ledger limit 1',
         'adjustment'),
  '42501', null, 'membro não insere em point_ledger');

select throws_ok(
  'update point_ledger set delta = 1000',
  '42501', null, 'membro não altera point_ledger');

select throws_ok(
  'delete from point_ledger',
  '42501', null, 'membro não apaga point_ledger');

select throws_ok(
  format('insert into checkins (church_id, event_id, ministry_member_id, arrived_at) values (%L, %L, %L, now())',
         (select v from ids where k = 'church_a'), (select v from ids where k = 'event_a'), (select v from ids where k = 'mm_member_a')),
  '42501', null, 'membro não insere em checkins');

select throws_ok(
  format('insert into checkin_requests (church_id, event_id, ministry_member_id, declared_arrived_at, reason) values (%L, %L, %L, now(), %L)',
         (select v from ids where k = 'church_a'), (select v from ids where k = 'event_a'), (select v from ids where k = 'mm_member_a'), 'esqueci'),
  '42501', null, 'membro não insere pedido "esqueci de registrar" direto (só via RPC)');

select throws_ok(
  format('insert into cycle_eligibility (church_id, ministry_id, cycle_id, ministry_member_id, balance, eligible) select church_id, ministry_id, cycle_id, ministry_member_id, 999, true from point_ledger limit 1'),
  '42501', null, 'membro não insere em cycle_eligibility');

select throws_ok(
  'update cycles set status = ''closed''',
  '42501', null, 'membro não fecha ciclo');

select throws_ok(
  format('insert into events (church_id, ministry_id, title, starts_at) values (%L, %L, %L, now())',
         (select v from ids where k = 'church_a'), (select v from ids where k = 'min_a'), 'Evento do membro'),
  '42501', null, 'membro comum não cria evento (só líder)');

select results_eq(
  'with u as (update ministry_members set status = ''inactive'' where user_id = ''aaaaaaaa-0000-4000-8000-000000000002'' returning 1) select count(*)::int from u',
  array[0], 'membro não altera o próprio cadastro no ministério');

select results_eq(
  'with u as (update ministry_members set role = ''leader'' returning 1) select count(*)::int from u',
  array[0], 'membro não se promove a líder');

select lives_ok(
  format('insert into justifications (church_id, event_id, ministry_member_id, kind, reason) values (%L, %L, %L, %L, %L)',
         (select v from ids where k = 'church_a'), (select v from ids where k = 'event_a'), (select v from ids where k = 'mm_member_a'),
         'absence', 'Viagem a trabalho'),
  'membro envia justificativa pendente antes do evento');

select throws_ok(
  format('insert into justifications (church_id, event_id, ministry_member_id, kind, reason, status) values (%L, %L, %L, %L, %L, %L)',
         (select v from ids where k = 'church_a'), (select v from ids where k = 'event_a'), (select v from ids where k = 'mm_member_a'),
         'late', 'Auto-aprovação', 'approved'),
  '42501', null, 'membro não cria justificativa já aprovada');

reset role;

-- -----------------------------------------------------------------------------
-- Visitante não logado (anon)
-- -----------------------------------------------------------------------------
select pg_temp.entrar_como_anonimo();

select throws_ok('select * from churches', '42501', null, 'anon não lê tabelas');
select throws_ok('select public.create_church(''Igreja Anônima'')', '42501', null, 'anon não cria igreja');

reset role;

-- -----------------------------------------------------------------------------
-- Convite: aceitar entra na igreja certa, com saldo cheio; expirado é recusado
-- -----------------------------------------------------------------------------
insert into invites (church_id, ministry_id, token, created_by)
values ((select v from ids where k = 'church_a'), (select v from ids where k = 'min_a'), 'token-valido', 'aaaaaaaa-0000-4000-8000-000000000001');
insert into invites (church_id, ministry_id, token, expires_at, created_by)
values ((select v from ids where k = 'church_a'), (select v from ids where k = 'min_a'), 'token-expirado', now() - interval '1 minute', 'aaaaaaaa-0000-4000-8000-000000000001');

select pg_temp.entrar_como_anonimo();
select is((select status from public.get_invite_preview('token-valido')), 'valid', 'anon vê a prévia do convite válido');
reset role;

select pg_temp.entrar_como('cccccccc-0000-4000-8000-000000000001', 'novo@teste.local');

select throws_ok('select public.accept_invite(''token-expirado'')', '22023', 'Este convite expirou', 'convite expirado é recusado');
select lives_ok('select public.accept_invite(''token-valido'')', 'convite válido é aceito');
select results_eq('select name from churches', array['Igreja A'], 'quem aceitou passa a ver só a igreja do convite');
reset role;

-- Convite de uso único já consumido não serve para outra pessoa
select pg_temp.entrar_como('bbbbbbbb-0000-4000-8000-000000000001', 'dono.b@teste.local');
select throws_ok('select public.accept_invite(''token-valido'')', '22023', 'Este convite já foi usado',
  'convite de uso único não é reutilizado');
reset role;

select * from finish();
rollback;
