-- =============================================================================
-- Áudio padrão da música: quando há vários áudios (voz principal, a voz de
-- cada músico…), o líder escolhe qual abre no player para todos. Cada pessoa
-- pode trocar para ouvir outro, só naquele momento (não muda para os outros).
-- =============================================================================
alter table public.song_files
  add column is_default boolean not null default false;

-- no máximo um padrão por música
create unique index song_files_one_default_idx
  on public.song_files (song_id) where is_default;

-- Marca (ou desmarca) o áudio padrão; desmarca o anterior na mesma transação.
create or replace function public.set_default_song_audio(p_file_id uuid, p_default boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_song uuid;
begin
  select f.song_id into v_song
  from public.song_files f
  where f.id = p_file_id and f.kind = 'audio';
  if v_song is null then
    raise exception 'Áudio não encontrado.' using errcode = 'P0002';
  end if;
  if not public.can_manage_song(v_song) then
    raise exception 'Só quem cuida dos arquivos da música pode escolher o áudio padrão.'
      using errcode = '42501';
  end if;
  update public.song_files set is_default = false
  where song_id = v_song and is_default and id <> p_file_id;
  update public.song_files set is_default = p_default where id = p_file_id;
end;
$$;
revoke execute on function public.set_default_song_audio(uuid, boolean) from public, anon;
grant execute on function public.set_default_song_audio(uuid, boolean) to authenticated;
