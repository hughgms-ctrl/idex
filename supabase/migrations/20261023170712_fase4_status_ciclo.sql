-- Fase 4: ciclo "fechando" — o ciclo terminou, o próximo já está aberto, mas
-- ainda corre o prazo dos pedidos "esqueci de registrar" (48h) antes de
-- calcular a elegibilidade. (Valor de enum novo precisa de migration própria.)
alter type public.cycle_status add value if not exists 'closing' before 'closed';
