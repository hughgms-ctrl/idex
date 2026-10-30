-- Fase 31 — apoio do ministério (som, data show…): só consulta, sem ser integrante.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.entrar_como(p_uid uuid)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_uid::text || '@f31.local')::text, true);
  set local role authenticated;
end;
$fn$;

select plan(24);

insert into auth.users (id, email) values
  ('a3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001@f31.local'),
  ('a3100000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000002@f31.local'),
  ('a3100000-0000-4000-8000-000000000003', 'a3100000-0000-4000-8000-000000000003@f31.local');

select pg_temp.entrar_como('a3100000-0000-4000-8000-000000000001');
select public.create_church('Igreja F31');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F31';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
-- integrante comum
insert into church_members (church_id, user_id) values
  ((select v from ids where k = 'church'), 'a3100000-0000-4000-8000-000000000003');
insert into ministry_members (church_id, ministry_id, user_id) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3100000-0000-4000-8000-000000000003');
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F31', now() + interval '3 days');
insert into ids select 'culto', id from events where title = 'Culto F31';
insert into songs (church_id, ministry_id, title, original_key, chordpro)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Música F31', 'G', '[G]Santo');
insert into ids select 'song', id from songs where title = 'Música F31';
insert into setlists (church_id, event_id) values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'));
insert into setlist_items (church_id, setlist_id, song_id, position, key)
select (select v from ids where k = 'church'), s.id, (select v from ids where k = 'song'), 0, 'A'
from setlists s where s.event_id = (select v from ids where k = 'culto');

-- Convite de apoio precisa do rótulo e não leva função nem papel de líder
select pg_temp.entrar_como('a3100000-0000-4000-8000-000000000001');
select throws_ok(
  format($$insert into invites (church_id, ministry_id, kind, created_by) values (%L, %L, 'support', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3100000-0000-4000-8000-000000000001'),
  '23514', null, 'convite de apoio sem rótulo é recusado');
select throws_ok(
  format($$insert into invites (church_id, ministry_id, kind, support_label, role, created_by) values (%L, %L, 'support', 'Som', 'leader', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3100000-0000-4000-8000-000000000001'),
  '23514', null, 'apoio não entra como líder');
select lives_ok(
  format($$insert into invites (church_id, ministry_id, kind, support_label, token, created_by) values (%L, %L, 'support', 'Mesa de som', 'tok-f31', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a3100000-0000-4000-8000-000000000001'),
  'líder cria convite de apoio com o rótulo que escreveu');
reset role;

select is((select kind || ':' || support_label from public.get_invite_preview('tok-f31')), 'support:Mesa de som',
  'a prévia mostra que é apoio e o rótulo');

-- Aceitar: entra na igreja como apoio, não como integrante
select pg_temp.entrar_como('a3100000-0000-4000-8000-000000000002');
select is(public.accept_invite('tok-f31', 'Pessoa do Som') ->> 'kind', 'support', 'aceita o convite de apoio');
reset role;
select is((select count(*)::int from ministry_members where user_id = 'a3100000-0000-4000-8000-000000000002'), 0,
  'não vira integrante (sem pontos, escala, conversas)');
select is((select role::text from church_members where user_id = 'a3100000-0000-4000-8000-000000000002'), 'member',
  'entra na igreja como membro comum');
select is((select label from ministry_supporters where user_id = 'a3100000-0000-4000-8000-000000000002'), 'Mesa de som',
  'fica como apoio com o rótulo do convite');
select is((select count(*)::int from point_ledger pl join ministry_members mm on mm.id = pl.ministry_member_id
  where mm.user_id = 'a3100000-0000-4000-8000-000000000002'), 0, 'não ganha crédito do ciclo');
select is(public.is_support_only((select v from ids where k = 'church'), 'a3100000-0000-4000-8000-000000000002'), true,
  'é só apoio');

-- O que o apoio vê
select pg_temp.entrar_como('a3100000-0000-4000-8000-000000000002');
select is((select count(*)::int from events where id = (select v from ids where k = 'culto')), 1, 'vê o culto');
select is((select key from setlist_items where song_id = (select v from ids where k = 'song')), 'A',
  'vê o tom definido para o culto');
select is((select chordpro from songs where id = (select v from ids where k = 'song')), '[G]Santo', 'vê a cifra');
select is((select count(*)::int from ministry_supporters), 1, 'vê só o próprio apoio');
select lives_ok($$update ministry_supporters set label = 'Chefe' $$, 'tentar mudar o próprio rótulo não dá erro…');
select throws_ok(
  format($$select public.open_direct_conversation(%L, %L)$$,
    (select v from ids where k = 'church'), 'a3100000-0000-4000-8000-000000000003'),
  '22023', null, 'apoio não abre conversa');
select throws_ok(
  format($$select public.remove_supporter(id) from ministry_supporters$$),
  '42501', null, 'apoio não se remove pela função do líder');
reset role;
select is((select label from ministry_supporters where user_id = 'a3100000-0000-4000-8000-000000000002'), 'Mesa de som',
  '…mas não muda nada (só o líder)');

-- Integrante não vê a lista de apoio nem abre conversa com o apoio
select pg_temp.entrar_como('a3100000-0000-4000-8000-000000000003');
select is((select count(*)::int from ministry_supporters), 0, 'integrante não vê quem é apoio');
select throws_ok(
  format($$select public.open_direct_conversation(%L, %L)$$,
    (select v from ids where k = 'church'), 'a3100000-0000-4000-8000-000000000002'),
  '22023', null, 'ninguém manda mensagem direta para o apoio');
reset role;

-- O líder renomeia e tira o apoio
select pg_temp.entrar_como('a3100000-0000-4000-8000-000000000001');
select lives_ok($$update ministry_supporters set label = 'Data show' $$, 'líder muda o rótulo');
select lives_ok(
  format($$select public.remove_supporter(%L)$$,
    (select id from ministry_supporters where user_id = 'a3100000-0000-4000-8000-000000000002')),
  'líder tira o apoio');
reset role;
select is((select count(*)::int from ministry_supporters where user_id = 'a3100000-0000-4000-8000-000000000002'), 0,
  'apoio removido');
select is((select count(*)::int from church_members where user_id = 'a3100000-0000-4000-8000-000000000002'), 0,
  'sem outro vínculo, sai da igreja (perde o acesso)');

select * from finish();
rollback;
