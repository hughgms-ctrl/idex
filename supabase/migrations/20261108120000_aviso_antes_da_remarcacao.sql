-- =============================================================================
-- Aviso de falta/atraso enviado antes de o evento mudar de dia/horário.
-- Ex.: "não posso, trabalho" para o ensaio de quinta; o líder remarca para
-- domingo e o aviso continua lá. Agora:
--  - events.previous_starts_at guarda o horário antigo (junto do rescheduled_at);
--  - o líder vê "enviado quando era qui, 5 nov 19:00";
--  - o integrante confirma que ainda vale (reconfirm_justification) ou cancela.
-- Também preenche rescheduled_at/previous_starts_at das remarcações feitas
-- antes desta mudança, a partir dos avisos de remarcação que já saíram.
-- =============================================================================

alter table public.events add column previous_starts_at timestamptz;

comment on column public.events.previous_starts_at is
  'Dia/horário antes da última remarcação (preenchido junto com rescheduled_at).';

create or replace function public.events_mark_rescheduled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.rescheduled_at := now();
    new.previous_starts_at := old.starts_at;
  else
    -- o cliente não marca sozinho
    new.rescheduled_at := old.rescheduled_at;
    new.previous_starts_at := old.previous_starts_at;
  end if;
  return new;
end;
$$;

create or replace function public.events_rescheduled_at_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rescheduled_at := null;
  new.previous_starts_at := null;
  return new;
end;
$$;

-- Remarcações antigas: o último aviso de remarcação de cada evento futuro
alter table public.events disable trigger events_mark_rescheduled;
update public.events e
set rescheduled_at = r.created_at,
    previous_starts_at = r.old_starts_at
from (
  select distinct on (split_part(q.dedupe_key, ':', 2))
    split_part(q.dedupe_key, ':', 2)::uuid as event_id,
    q.created_at,
    (q.payload ->> 'oldStartsAt')::timestamptz as old_starts_at
  from public.notification_queue q
  where q.kind = 'event_rescheduled'
    and q.dedupe_key ~ '^resched:[0-9a-f-]{36}:'
    and q.payload ? 'oldStartsAt'
  order by split_part(q.dedupe_key, ':', 2), q.created_at desc
) r
where e.id = r.event_id
  and e.rescheduled_at is null
  and e.starts_at > now();
alter table public.events enable trigger events_mark_rescheduled;

-- O integrante confirma que o aviso pendente ainda vale para o novo horário
alter table public.justifications add column reconfirmed_at timestamptz;

comment on column public.justifications.reconfirmed_at is
  'Quando o integrante confirmou que o aviso ainda vale (depois de uma remarcação).';

create or replace function public.reconfirm_justification(p_justification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select j.id, j.ministry_member_id, j.status, e.starts_at
  into v_row
  from public.justifications j
  join public.events e on e.id = j.event_id
  where j.id = p_justification_id;
  if v_row.id is null or not public.is_self_member(v_row.ministry_member_id) then
    raise exception 'Aviso não encontrado' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'O líder já analisou este aviso' using errcode = '22023';
  end if;
  if v_row.starts_at <= now() then
    raise exception 'O evento já começou' using errcode = '22023';
  end if;
  update public.justifications set reconfirmed_at = now() where id = p_justification_id;
end;
$$;
revoke execute on function public.reconfirm_justification(uuid) from public, anon;
grant execute on function public.reconfirm_justification(uuid) to authenticated;

-- Aviso de remarcação também para quem mandou aviso de falta/atraso pendente
-- (mesmo que não esteja mais na escala desse evento).
create or replace function public.notify_event_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_service uuid := coalesce(new.service_event_id, new.id);
begin
  if new.starts_at is not distinct from old.starts_at or new.starts_at <= now() then
    return null;
  end if;
  for v_row in
    select distinct mm.user_id
    from public.ministry_members mm
    where mm.status = 'active'
      and (
        mm.id in (
          select sa.ministry_member_id from public.schedule_assignments sa
          where sa.event_id = new.id and sa.status in ('scheduled', 'confirmed')
        )
        or mm.id in (
          select j.ministry_member_id from public.justifications j
          where j.event_id = new.id and j.status = 'pending'
        )
        or (
          new.kind = 'service'
          and mm.id in (
            select ea.ministry_member_id from public.event_availability ea
            where ea.event_id = new.id
          )
        )
      )
  loop
    perform public.enqueue_notification(
      new.church_id, v_row.user_id, 'event_rescheduled',
      'resched:' || new.id || ':' || v_row.user_id || ':' || extract(epoch from new.starts_at)::bigint,
      jsonb_build_object(
        'eventTitle', new.title, 'eventStartsAt', new.starts_at, 'arriveAt', new.arrive_at,
        'oldStartsAt', old.starts_at, 'kind', new.kind,
        'path', '/confirmar/' || v_service
      )
    );
  end loop;
  return null;
end;
$$;
revoke execute on function public.notify_event_rescheduled() from public, anon, authenticated;
