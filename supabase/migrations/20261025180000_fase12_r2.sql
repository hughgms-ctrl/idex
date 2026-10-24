-- =============================================================================
-- Fase 12 — arquivos das músicas no Cloudflare R2 (10 GB grátis, até 100 MB
-- por arquivo). O registro continua aqui; `storage_backend` diz onde está o
-- arquivo. A Edge Function `song-storage` gera os links (envio só do líder).
-- =============================================================================
alter table public.song_files
  add column storage_backend text not null default 'supabase'
    check (storage_backend in ('supabase', 'r2'));
