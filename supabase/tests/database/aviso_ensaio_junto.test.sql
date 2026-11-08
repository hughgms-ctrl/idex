-- Aviso de falta/atraso com o ensaio junto do culto (mesma chegada): o aviso
-- enviado no ensaio vale também para o culto — sem −20, conta como justificado
-- na meta da equipe e o atraso registrado no culto não desconta.
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

select plan(8);

insert into auth.users (id, email) values
  ('c3000000-0000-4000-8000-000000000001', 'lider@aviso.local'),
  ('c3000000-0000-4000-8000-000000000002', 'faltou@aviso.local'),
  ('c3000000-0000-4000-8000-000000000003', 'atrasou@aviso.local'),
  ('c3000000-0000-4000-8000-000000000004', 'sumiu@aviso.local');

select pg_temp.entrar_como('c3000000-0000-4000-8000-000000000001');
select public.create_church('Igreja Aviso');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja Aviso';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
update cycles set starts_on = (now() at time zone 'America/Sao_Paulo')::date - 10
where ministry_id = (select v from ids where k = 'louvor');
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'c3000000-0000-4000-8000-000000000002'::uuid, 'c3000000-0000-4000-8000-000000000003'::uuid,
  'c3000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'c3000000-0000-4000-8000-000000000002'::uuid, 'c3000000-0000-4000-8000-000000000003'::uuid,
  'c3000000-0000-4000-8000-000000000004'::uuid]) u;
insert into ids select 'faltou', id from ministry_members where user_id = 'c3000000-0000-4000-8000-000000000002';
insert into ids select 'atrasou', id from ministry_members where user_id = 'c3000000-0000-4000-8000-000000000003';
insert into ids select 'sumiu', id from ministry_members where user_id = 'c3000000-0000-4000-8000-000000000004';

-- culto e ensaio no futuro, com a mesma chegada (avisos só antes do início)
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at, ends_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto Aviso',
        now() + interval '3 hours', now() + interval '1 hour 40 minutes', now() + interval '5 hours');
insert into ids select 'culto', id from events where title = 'Culto Aviso';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'culto'), v
from ids where k in ('faltou', 'atrasou', 'sumiu');
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at, ends_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio Aviso',
        now() + interval '2 hours', now() + interval '1 hour 40 minutes', now() + interval '3 hours',
        (select v from ids where k = 'culto'));
insert into ids select 'ensaio', id from events where title = 'Ensaio Aviso';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), i.v
from ids i
where i.k in ('faltou', 'atrasou', 'sumiu')
  and not exists (select 1 from schedule_assignments sa
                  where sa.event_id = (select v from ids where k = 'ensaio') and sa.ministry_member_id = i.v);

-- avisos enviados no ENSAIO
select pg_temp.entrar_como('c3000000-0000-4000-8000-000000000002');
insert into justifications (church_id, event_id, ministry_member_id, kind, reason)
values ((select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), (select v from ids where k = 'faltou'), 'absence', 'Trabalho');
reset role;
select pg_temp.entrar_como('c3000000-0000-4000-8000-000000000003');
insert into justifications (church_id, event_id, ministry_member_id, kind, reason)
values ((select v from ids where k = 'church'), (select v from ids where k = 'ensaio'), (select v from ids where k = 'atrasou'), 'late', 'Carro');
reset role;
select pg_temp.entrar_como('c3000000-0000-4000-8000-000000000001');
select public.review_justification(id, true) from justifications;
reset role;

-- um 2º aviso no culto junto não entra: o do ensaio já vale para os dois
select pg_temp.entrar_como('c3000000-0000-4000-8000-000000000002');
select throws_ok(
  format($$insert into justifications (church_id, event_id, ministry_member_id, kind, reason) values (%L, %L, %L, 'absence', 'De novo')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'faltou')),
  '22023', null, 'não aceita um 2º aviso no evento junto');
reset role;

select ok(public.has_approved_justification((select v from ids where k = 'culto'), (select v from ids where k = 'faltou')),
  'aviso do ensaio vale para o culto junto');
select ok(not public.has_approved_justification((select v from ids where k = 'culto'), (select v from ids where k = 'sumiu')),
  'quem não avisou continua sem aviso');

-- atraso registrado no culto: com aviso aprovado no ensaio, não desconta
select public.record_attendance((select v from ids where k = 'culto'), (select v from ids where k = 'atrasou'),
  now(), 25, -10, 'geo');
select is((select count(*)::int from point_ledger where ministry_member_id = (select v from ids where k = 'atrasou') and reason = 'late'),
  0, 'atraso no culto não desconta com aviso aprovado no ensaio');

-- os eventos terminam e passa o prazo do "esqueci"
update events set starts_at = starts_at - interval '3 days', arrive_at = arrive_at - interval '3 days',
                  ends_at = ends_at - interval '3 days'
where id in ((select v from ids where k = 'culto'), (select v from ids where k = 'ensaio'));
select public.process_absences();

select is((select count(*)::int from point_ledger where ministry_member_id = (select v from ids where k = 'faltou') and reason = 'absence'),
  0, 'quem avisou no ensaio não leva falta no culto nem no ensaio');
select is((select count(*)::int from point_ledger where ministry_member_id = (select v from ids where k = 'sumiu') and reason = 'absence'),
  2, 'quem não avisou leva falta nos dois');
select is(public.commitment_outcome((select v from ids where k = 'culto'), (select v from ids where k = 'faltou')),
  'excused', 'meta da equipe: culto conta como justificado');

-- painel ao vivo do líder vê o aviso do ensaio no culto
select pg_temp.entrar_como('c3000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.justifications_for_event((select v from ids where k = 'culto'))),
  2, 'avisos do ensaio aparecem no culto para o líder');
reset role;

select * from finish();
rollback;
