-- =============================================================================
-- Fase 5 — Planejamento trimestral
-- "Música nova" para a regra de novas por mês = marcada pelo líder como
-- "a banda ainda está aprendendo" (e conta só no mês em que estreia).
-- Assim, ao começar a usar o app sem histórico, o repertório conhecido não
-- é tratado como novo.
-- =============================================================================
alter table public.songs add column if not exists is_new boolean not null default false;

comment on column public.songs.is_new is
  'Marcada pelo líder: a banda ainda está aprendendo. Conta como "nova" no mês da estreia.';
