-- Fase 13 — aviso de evento remarcado (valor novo do enum em migration própria)
alter type public.notification_kind add value if not exists 'event_rescheduled';
