-- Excluir integrante: só o líder; apaga em cascata e tira da igreja quem fica sem vínculo.
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

select plan(10);

insert into auth.users (id, email) values
  ('a3300000-0000-4000-8000-000000000001', 'lider@exc.local'),
  ('a3300000-0000-4000-8000-000000000002', 'saymon@exc.local'),
  ('a3300000-0000-4000-8000-000000000003', 'outro@exc.local');

select pg_temp.entrar_como('a3300000-0000-4000-8000-000000000001');
select public.create_church('Igreja Exc');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja Exc';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values
  ((select v from ids where k = 'church'), 'a3300000-0000-4000-8000-000000000002'),
  ((select v from ids where k = 'church'), 'a3300000-0000-4000-8000-000000000003');
insert into ministry_members (church_id, ministry_id, user_id) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3300000-0000-4000-8000-000000000002'),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3300000-0000-4000-8000-000000000003');
insert into ids select 'saymon', id from ministry_members where user_id = 'a3300000-0000-4000-8000-000000000002';
insert into ids select 'lider', id from ministry_members where user_id = 'a3300000-0000-4000-8000-000000000001';
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto Exc', now() + interval '3 days');
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), e.id, (select v from ids where k = 'saymon')
from events e where e.title = 'Culto Exc';

-- Integrante comum não exclui ninguém
select pg_temp.entrar_como('a3300000-0000-4000-8000-000000000003');
select throws_ok(format($$select public.remove_ministry_member(%L)$$, (select v from ids where k = 'saymon')),
  '42501', null, 'integrante não exclui');
reset role;

-- Líder não exclui a si mesmo
select pg_temp.entrar_como('a3300000-0000-4000-8000-000000000001');
select throws_ok(format($$select public.remove_ministry_member(%L)$$, (select v from ids where k = 'lider')),
  '22023', null, 'líder não exclui a si mesmo');

-- Líder exclui quem entrou errado
select lives_ok(format($$select public.remove_ministry_member(%L)$$, (select v from ids where k = 'saymon')),
  'líder exclui o integrante');
reset role;

select is((select count(*)::int from ministry_members where user_id = 'a3300000-0000-4000-8000-000000000002'), 0,
  'sai do ministério');
select is((select count(*)::int from schedule_assignments where ministry_member_id = (select v from ids where k = 'saymon')), 0,
  'escalas apagadas junto');
select is((select count(*)::int from point_ledger where ministry_member_id = (select v from ids where k = 'saymon')), 0,
  'pontos apagados junto');
select is((select count(*)::int from church_members where user_id = 'a3300000-0000-4000-8000-000000000002'), 0,
  'sem outro vínculo, sai da igreja');
select is((select count(*)::int from ministry_members where user_id = 'a3300000-0000-4000-8000-000000000003'), 1,
  'os outros continuam');

-- Pode voltar por convite de apoio
select pg_temp.entrar_como('a3300000-0000-4000-8000-000000000001');
insert into invites (church_id, ministry_id, kind, support_label, token, created_by)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'support', 'Mídia', 'tok-exc', 'a3300000-0000-4000-8000-000000000001');
reset role;
select pg_temp.entrar_como('a3300000-0000-4000-8000-000000000002');
select is(public.accept_invite('tok-exc') ->> 'kind', 'support', 'volta pelo convite de apoio');
reset role;
select is((select label from ministry_supporters where user_id = 'a3300000-0000-4000-8000-000000000002'), 'Mídia',
  'agora é apoio da mídia');

select * from finish();
rollback;
