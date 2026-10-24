-- Fase 19 — aviso escrito pelo líder (central de avisos). Fica numa migration
-- própria porque o valor novo do enum só pode ser usado depois do commit.
alter type public.notification_kind add value if not exists 'announcement';
