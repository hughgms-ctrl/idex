-- Fase 17 — decisões do líder sobre falta no ensaio (pedido "esqueci" pendente
-- e aviso de falta aprovado).
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
  ('b1000000-0000-4000-8000-000000000001', 'lider@f17.local'),
  ('b1000000-0000-4000-8000-000000000002', 'esqueceu@f17.local'),
  ('b1000000-0000-4000-8000-000000000003', 'avisou@f17.local'),
  ('b1000000-0000-4000-8000-000000000004', 'pendente@f17.local');

select pg_temp.entrar_como('b1000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F17');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja F17';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'b1000000-0000-4000-8000-000000000002'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid,
  'b1000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'b1000000-0000-4000-8000-000000000002'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid,
  'b1000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ids select 'esqueceu', id from ministry_members where user_id = 'b1000000-0000-4000-8000-000000000002';
insert into ids select 'avisou', id from ministry_members where user_id = 'b1000000-0000-4000-8000-000000000003';
insert into ids select 'pendente', id from ministry_members where user_id = 'b1000000-0000-4000-8000-000000000004';
update ministry_settings set rehearsal_late_consequence = 'out_rehearsal_and_service'
where ministry_id = (select v from ids where k = 'louvor');

insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F17', now() + interval '3 days');
insert into ids select 'culto', id from events where title = 'Culto F17';
insert into events (church_id, ministry_id, kind, title, starts_at, ends_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio F17',
        now() - interval '5 hours', now() - interval '3 hours', (select v from ids where k = 'culto'));
insert into ids select 'ensaio', id from events where title = 'Ensaio F17';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'culto'), v
from ids where k in ('esqueceu', 'avisou', 'pendente');

-- "esqueceu": pediu "esqueci" (pendente); "avisou": falta avisada e aprovada;
-- "pendente": avisou a falta, mas o líder ainda não analisou
insert into checkin_requests (church_id, event_id, ministry_member_id, declared_arrived_at, reason)
values ((select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), (select v from ids where k = 'esqueceu'),
        now() - interval '5 hours', 'Celular sem bateria');
insert into justifications (church_id, event_id, ministry_member_id, kind, reason, status)
values ((select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), (select v from ids where k = 'avisou'),
        'absence', 'Plantão', 'approved'),
       ((select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), (select v from ids where k = 'pendente'),
        'absence', 'Viagem', 'pending');

create function pg_temp.no_culto(p_k text) returns text language sql as $$
  select status::text from schedule_assignments
  where event_id = (select v from ids where k = 'culto') and ministry_member_id = (select v from ids where k = p_k)
$$;

-- Padrão: "esqueci" pendente fica fora até aprovar; aviso aprovado toca no culto
set local role service_role;
select public.process_absences();
reset role;
select is(pg_temp.no_culto('esqueceu'), 'benched', 'padrão: pedido "esqueci" pendente fica fora até o líder aprovar');
select is(pg_temp.no_culto('avisou'), 'scheduled', 'padrão: quem avisou e teve o aviso aprovado toca no culto');
select is(pg_temp.no_culto('pendente'), 'benched', 'aviso ainda não analisado: fica fora');

-- Líder aprova o aviso depois: volta para a escala
select pg_temp.entrar_como('b1000000-0000-4000-8000-000000000001');
select public.review_justification((select id from justifications where reason = 'Viagem'), true);
reset role;
select is(pg_temp.no_culto('pendente'), 'scheduled', 'aviso aprovado depois: volta para o culto');

-- Outras escolhas do líder: esperar o pedido; sem ensaio, sem culto
update schedule_assignments set status = 'scheduled', benched_reason = null
where event_id in ((select v from ids where k = 'culto'), (select v from ids where k = 'ensaio'));
update ministry_settings set rehearsal_forgot_policy = 'keep_until_reviewed', rehearsal_excused_policy = 'out_of_service'
where ministry_id = (select v from ids where k = 'louvor');
set local role service_role;
select public.process_absences();
reset role;
select is(pg_temp.no_culto('esqueceu'), 'scheduled', 'escolha "esperar": pedido pendente continua escalado');
select is(pg_temp.no_culto('avisou'), 'benched', 'escolha "sem ensaio, sem culto": aviso aprovado também fica fora');
select is((select benched_reason from schedule_assignments
           where event_id = (select v from ids where k = 'culto') and ministry_member_id = (select v from ids where k = 'avisou')),
  'Faltou ao ensaio (com aviso)', 'o motivo diz que avisou');

select pg_temp.entrar_como('b1000000-0000-4000-8000-000000000001');
update ministry_settings set rehearsal_excused_policy = 'can_play' where ministry_id = (select v from ids where k = 'louvor');
reset role;
select is((select rehearsal_excused_policy from ministry_settings where ministry_id = (select v from ids where k = 'louvor')),
  'can_play', 'o líder muda a escolha em Configurações');

select throws_ok($$update ministry_settings set rehearsal_forgot_policy = 'x'$$, '23514', null, 'só aceita as opções previstas');

select * from finish();
rollback;
