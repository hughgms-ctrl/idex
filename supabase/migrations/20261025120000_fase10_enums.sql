-- Fase 10 — valores novos de enum (em migration própria)
alter type public.assignment_status add value if not exists 'benched';
alter type public.notification_kind add value if not exists 'member_benched';
