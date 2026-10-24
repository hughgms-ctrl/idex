-- Fase 14 — avisos programados de culto e ensaio (valor novo do enum em migration própria)
alter type public.notification_kind add value if not exists 'event_reminder';
