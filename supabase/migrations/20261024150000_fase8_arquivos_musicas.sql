-- =============================================================================
-- Fase 8 — arquivos das músicas (áudio de referência, PDF, imagem)
--
-- Os arquivos ficam no Storage, bucket privado `song-files`, no caminho
-- {church_id}/{song_id}/{arquivo}. A tabela `song_files` guarda o nome e o
-- tipo. Quem é da igreja ouve/baixa; o líder do ministério envia e apaga.
-- (Só arquivo para ouvir no player do navegador; multitracks são outro produto.)
-- =============================================================================

create table public.song_files (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null,
  song_id      uuid not null,
  name         text not null check (length(trim(name)) between 1 and 200),
  kind         text not null check (kind in ('audio', 'pdf', 'image', 'other')),
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint check (size_bytes is null or size_bytes >= 0),
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (song_id, church_id) references public.songs (id, church_id) on delete cascade,
  -- o caminho no Storage começa pela igreja e pela música
  check (storage_path like church_id::text || '/' || song_id::text || '/%')
);
create index song_files_song_idx on public.song_files (song_id, created_at);
create index song_files_church_idx on public.song_files (church_id);

-- O usuário logado pode mexer nos arquivos desta música? (líder do ministério dela)
create or replace function public.can_manage_song(p_song_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.songs s
    where s.id = p_song_id and public.is_ministry_leader(s.ministry_id)
  );
$$;
revoke execute on function public.can_manage_song(uuid) from public, anon;
grant execute on function public.can_manage_song(uuid) to authenticated;

alter table public.song_files enable row level security;
create policy song_files_select on public.song_files
  for select to authenticated using (public.is_church_member(church_id));
create policy song_files_insert on public.song_files
  for insert to authenticated with check (public.can_manage_song(song_id));
create policy song_files_update on public.song_files
  for update to authenticated
  using (public.can_manage_song(song_id)) with check (public.can_manage_song(song_id));
create policy song_files_delete on public.song_files
  for delete to authenticated using (public.can_manage_song(song_id));
revoke update on public.song_files from authenticated;
grant update (name) on public.song_files to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado, até 50 MB, só áudio, PDF e imagem
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'song-files', 'song-files', false, 52428800,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
    'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/flac',
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Caminho {church_id}/{song_id}/…: as pastas dizem de quem é o arquivo.
create or replace function public.storage_song_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[2]::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.storage_church_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.storage_song_id(text), public.storage_church_id(text) to authenticated;

create policy song_files_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'song-files' and public.is_church_member(public.storage_church_id(name)));

create policy song_files_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'song-files'
    and public.can_manage_song(public.storage_song_id(name))
    and exists (
      select 1 from public.songs s
      where s.id = public.storage_song_id(name) and s.church_id = public.storage_church_id(name)
    )
  );

create policy song_files_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'song-files' and public.can_manage_song(public.storage_song_id(name)));
