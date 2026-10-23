-- Fase 7 — ponto só pela localização (valor novo do enum em migration própria)
alter type public.checkin_source add value if not exists 'geo' after 'qr';
