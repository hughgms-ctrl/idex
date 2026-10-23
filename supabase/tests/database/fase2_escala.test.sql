-- Fase 2 — escala: quem vê indisponibilidade e quem pode escalar quem.
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000001', 'lider@f2.local', '{"full_name": "Líder"}'),
  ('d0000000-0000-4000-8000-000000000002', 'm1@f2.local', '{"full_name": "Membro 1"}'),
  ('d0000000-0000-4000-8000-000000000003', 'm2@f2.local', '{"full_name": "Membro 2"}');

select pg_temp.entrar_como('d0000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F2');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F2';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
-- segundo ministério na mesma igreja
insert into ministries (church_id, name, kind) values ((select v from ids where k = 'church'), 'Mídia', 'media');
insert into ids select 'midia', id from ministries where name = 'Mídia' and church_id = (select v from ids where k = 'church');

insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'd0000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'd0000000-0000-4000-8000-000000000002'),
       ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'd0000000-0000-4000-8000-000000000003');
-- Membro 2 só está na Mídia? Não: criamos também um membro da Mídia (o próprio Membro 2)
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'midia'), 'd0000000-0000-4000-8000-000000000003');

insert into ids select 'mm1', id from ministry_members where user_id = 'd0000000-0000-4000-8000-000000000002';
insert into ids select 'mm2_louvor', id from ministry_members
  where user_id = 'd0000000-0000-4000-8000-000000000003' and ministry_id = (select v from ids where k = 'louvor');
insert into ids select 'mm2_midia', id from ministry_members
  where user_id = 'd0000000-0000-4000-8000-000000000003' and ministry_id = (select v from ids where k = 'midia');

insert into events (church_id, ministry_id, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Culto', now() + interval '3 days');
insert into ids select 'evento', id from events where title = 'Culto' and church_id = (select v from ids where k = 'church');

-- Membro 1 marca indisponibilidade
select pg_temp.entrar_como('d0000000-0000-4000-8000-000000000002');
select lives_ok(
  format('insert into member_unavailability (church_id, ministry_member_id, starts_at, ends_at, reason) values (%L, %L, now(), now() + interval %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'mm1'), '7 days', 'Viagem'),
  'membro marca a própria indisponibilidade');
select throws_ok(
  format('insert into member_unavailability (church_id, ministry_member_id, starts_at, ends_at) values (%L, %L, now(), now() + interval %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'mm2_louvor'), '1 day'),
  '42501', null, 'membro não marca indisponibilidade de outra pessoa');
reset role;

select pg_temp.entrar_como('d0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from member_unavailability), 0, 'outro membro não vê a indisponibilidade (nem o motivo)');
select throws_ok(
  format('insert into schedule_assignments (church_id, event_id, ministry_member_id) values (%L, %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'mm2_louvor')),
  '42501', null, 'membro comum não escala ninguém');
reset role;

select pg_temp.entrar_como('d0000000-0000-4000-8000-000000000001');
select is((select count(*)::int from member_unavailability), 1, 'líder vê a indisponibilidade da equipe');
select lives_ok(
  format('insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id) values (%L, %L, %L, (select id from ministry_roles where ministry_id = %L and name = %L))',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'mm1'),
    (select v from ids where k = 'louvor'), 'Violão'),
  'líder escala membro do ministério do evento');
select throws_ok(
  format('insert into schedule_assignments (church_id, event_id, ministry_member_id) values (%L, %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'mm2_midia')),
  '22023', 'O integrante não é do ministério deste evento', 'não escala gente de outro ministério');
select throws_ok(
  format('insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id) values (%L, %L, %L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'mm2_louvor'),
    gen_random_uuid()),
  null, null, 'não usa função inexistente/de outro ministério');
reset role;

select * from finish();
rollback;
