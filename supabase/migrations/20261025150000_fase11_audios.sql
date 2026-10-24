-- =============================================================================
-- Fase 11 — página de áudios: cada áudio tem nome editável, BPM e tom
-- (para o player mudar o tom, o andamento e tocar o metrônomo junto).
-- =============================================================================
alter table public.song_files
  add column bpm         integer check (bpm between 20 and 300),
  add column musical_key text check (musical_key is null or musical_key ~ '^[A-G](#|b)?m?$');

revoke update on public.song_files from authenticated;
grant update (name, bpm, musical_key) on public.song_files to authenticated;
