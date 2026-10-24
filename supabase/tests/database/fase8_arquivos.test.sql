-- Fase 8 — arquivos das músicas (tabela + Storage).
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
  ('a8000000-0000-4000-8000-000000000001', 'lider@f8.local'),
  ('a8000000-0000-4000-8000-000000000002', 'membro@f8.local'),
  ('a8000000-0000-4000-8000-000000000003', 'fora@f8.local');

select pg_temp.entrar_como('a8000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F8');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F8';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'a8000000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a8000000-0000-4000-8000-000000000002');
insert into songs (church_id, ministry_id, title)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Música F8');
insert into ids select 'song', id from songs where title = 'Música F8';
insert into ids values ('path_ok', null);

create temporary table paths (k text primary key, p text) on commit drop;
grant select on paths to authenticated;
insert into paths values
  ('ok', (select v from ids where k = 'church') || '/' || (select v from ids where k = 'song') || '/guia.mp3'),
  ('membro', (select v from ids where k = 'church') || '/' || (select v from ids where k = 'song') || '/membro.mp3');

-- Líder envia (Storage + tabela)
select pg_temp.entrar_como('a8000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id) values ('song-files', %L, %L)$$,
    (select p from paths where k = 'ok'), 'a8000000-0000-4000-8000-000000000001'),
  'líder envia o arquivo para o Storage');
select lives_ok(
  format($$insert into song_files (church_id, song_id, name, kind, storage_path) values (%L, %L, 'guia.mp3', 'audio', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'song'), (select p from paths where k = 'ok')),
  'líder registra o arquivo na música');
select throws_ok(
  format($$insert into song_files (church_id, song_id, name, kind, storage_path) values (%L, %L, 'x', 'audio', 'outra/pasta/x.mp3')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'song')),
  '23514', null, 'caminho fora da pasta da música é recusado');
reset role;

-- Membro ouve, mas não envia nem apaga
select pg_temp.entrar_como('a8000000-0000-4000-8000-000000000002');
select is((select count(*)::int from song_files), 1, 'membro vê o arquivo');
select is((select count(*)::int from storage.objects where bucket_id = 'song-files'), 1, 'membro pode baixar/ouvir');
select throws_ok(
  format($$insert into storage.objects (bucket_id, name, owner_id) values ('song-files', %L, %L)$$,
    (select p from paths where k = 'membro'), 'a8000000-0000-4000-8000-000000000002'),
  '42501', null, 'membro não envia arquivo');
delete from song_files;
select is((select count(*)::int from song_files), 1, 'membro não apaga o registro');
-- o Storage bloqueia DELETE direto; liberamos só para testar a regra de acesso
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'song-files';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'song-files' and name = (select p from paths where k = 'ok')), 1,
  'membro não apaga o arquivo');

-- Quem é de outra igreja não vê nada
select pg_temp.entrar_como('a8000000-0000-4000-8000-000000000003');
select is((select count(*)::int from song_files), 0, 'outra igreja não vê o registro');
select is((select count(*)::int from storage.objects where bucket_id = 'song-files'), 0, 'outra igreja não acessa o arquivo');
reset role;

select * from finish();
rollback;
