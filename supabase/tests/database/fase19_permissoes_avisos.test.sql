-- Fase 19 — permissões individuais (diretor musical) e central de avisos.
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

select plan(17);

insert into auth.users (id, email) values
  ('a9100000-0000-4000-8000-000000000001', 'lider@f19.local'),
  ('a9100000-0000-4000-8000-000000000002', 'diretor@f19.local'),
  ('a9100000-0000-4000-8000-000000000003', 'membro@f19.local');

select pg_temp.entrar_como('a9100000-0000-4000-8000-000000000001');
select public.create_church('Igreja F19');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F19';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values
  ((select v from ids where k = 'church'), 'a9100000-0000-4000-8000-000000000002'),
  ((select v from ids where k = 'church'), 'a9100000-0000-4000-8000-000000000003');
insert into ministry_members (church_id, ministry_id, user_id) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a9100000-0000-4000-8000-000000000002'),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a9100000-0000-4000-8000-000000000003');
insert into ids select 'diretor', id from ministry_members where user_id = 'a9100000-0000-4000-8000-000000000002';
insert into ids select 'membro', id from ministry_members where user_id = 'a9100000-0000-4000-8000-000000000003';
insert into songs (church_id, ministry_id, title)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Música F19');
insert into ids select 'song', id from songs where title = 'Música F19';

-- Sem permissão, o diretor é um integrante comum
select pg_temp.entrar_como('a9100000-0000-4000-8000-000000000002');
select throws_ok(
  format($$insert into songs (church_id, ministry_id, title) values (%L, %L, 'x')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor')),
  '42501', null, 'sem permissão não cadastra música');
select is(public.can_manage_song((select v from ids where k = 'song')), false, 'sem permissão não envia arquivos');
select lives_ok(
  format($$update ministry_members set can_edit_songs = true where id = %L$$, (select v from ids where k = 'diretor')),
  'tentar ligar a própria permissão não dá erro…');
reset role;
select is((select can_edit_songs from ministry_members where id = (select v from ids where k = 'diretor')), false,
  '…mas não muda nada (só o líder liga)');

-- O líder liga as chavinhas
select pg_temp.entrar_como('a9100000-0000-4000-8000-000000000001');
select lives_ok(
  format($$update ministry_members set can_edit_songs = true, can_manage_song_files = true, can_send_announcements = true where id = %L$$,
    (select v from ids where k = 'diretor')),
  'líder liga as permissões do diretor musical');
reset role;

select pg_temp.entrar_como('a9100000-0000-4000-8000-000000000002');
select lives_ok(
  format($$insert into songs (church_id, ministry_id, title) values (%L, %L, 'Nova do diretor')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor')),
  'com a permissão cadastra música');
select lives_ok(
  format($$update songs set chordpro = '[G]Teste' where id = %L$$, (select v from ids where k = 'song')),
  'com a permissão edita a cifra');
select is(public.can_manage_song((select v from ids where k = 'song')), true, 'com a permissão envia arquivos');
delete from songs where id = (select v from ids where k = 'song');
select is((select count(*)::int from songs where id = (select v from ids where k = 'song')), 1, 'apagar música continua só do líder');
select is(public.has_ministry_permission((select v from ids where k = 'louvor'), 'setlists'), false,
  'permissão desligada continua desligada');

-- Central de avisos
select lives_ok(
  format($$insert into announcements (church_id, ministry_id, title, body, audience, member_ids, send_at)
           values (%L, %L, 'Ensaio extra', 'Sábado 15h', 'members', array[%L]::uuid[], now() - interval '1 minute')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), (select v from ids where k = 'membro')),
  'diretor com permissão agenda um aviso');
select throws_ok(
  format($$insert into announcements (church_id, ministry_id, title, body, status) values (%L, %L, 'x', 'y', 'sent')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'louvor')),
  '42501', null, 'cliente não marca aviso como enviado');
select is(public.count_announcement_audience((select v from ids where k = 'louvor'), 'all'), 3, 'prévia conta toda a equipe');
reset role;

select pg_temp.entrar_como('a9100000-0000-4000-8000-000000000003');
select is((select count(*)::int from announcements), 0, 'integrante comum não vê a central');
reset role;

select is(public.dispatch_announcements(), 1, 'job envia o aviso que venceu');
select is((select count(*)::int from notification_queue where kind = 'announcement'
           and profile_id = 'a9100000-0000-4000-8000-000000000003'), 1, 'só a pessoa escolhida entra na fila');
select is(public.dispatch_announcements(), 0, 'não envia duas vezes');

select * from finish();
rollback;
