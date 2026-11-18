-- Ensaio "junto do culto" também quando um emenda no outro: o primeiro (pela
-- chegada) ainda não acabou na hora de chegada do segundo (até 5 min de folga).
-- Ex.: ensaio de vozes 16:30–18:30 (chegada 16:10) e culto 18:00 (chegada
-- 16:40): quem registrou presença no ensaio estava lá para o culto e levava
-- falta no culto, porque a regra antiga só juntava chegadas até 5 min.
-- Espelho de `eventsJoint` em `_shared/domain/schedule.ts` (sem `ends_at`, o
-- evento dura 2 h, como `eventEnd`). Tudo que já usa `events_joint`
-- ("esqueci", avisos, process_absences, meta da equipe) passa a valer junto.

create or replace function public.events_joint(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with pair as (
    select
      coalesce(x.arrive_at, x.starts_at) as call_x,
      coalesce(y.arrive_at, y.starts_at) as call_y,
      coalesce(x.ends_at, x.starts_at + interval '2 hours') as end_x,
      coalesce(y.ends_at, y.starts_at + interval '2 hours') as end_y
    from public.events x
    join public.events y on y.id = p_b
    where x.id = p_a
      and x.id <> y.id
      and coalesce(x.service_event_id, x.id) = coalesce(y.service_event_id, y.id)
  )
  select exists (
    select 1 from pair
    where abs(extract(epoch from call_x - call_y)) <= 300
       or (call_x < call_y and end_x >= call_y - interval '5 minutes')
       or (call_y < call_x and end_y >= call_x - interval '5 minutes')
  );
$$;

revoke all on function public.events_joint(uuid, uuid) from public, anon, authenticated;
