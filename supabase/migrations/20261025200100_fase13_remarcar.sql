-- =============================================================================
-- Fase 13 — ensaio (ou culto) remarcado: avisa a equipe escalada
-- (WhatsApp e celular), com o novo dia/horário e a chegada.
-- =============================================================================
create or replace function public.notify_event_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  if new.starts_at is not distinct from old.starts_at or new.starts_at <= now() then
    return null;
  end if;
  for v_row in
    select distinct mm.user_id
    from public.schedule_assignments sa
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    where sa.event_id = new.id and sa.status in ('scheduled', 'confirmed')
  loop
    perform public.enqueue_notification(
      new.church_id, v_row.user_id, 'event_rescheduled',
      'resched:' || new.id || ':' || v_row.user_id || ':' || extract(epoch from new.starts_at)::bigint,
      jsonb_build_object(
        'eventTitle', new.title, 'eventStartsAt', new.starts_at, 'arriveAt', new.arrive_at,
        'oldStartsAt', old.starts_at, 'kind', new.kind
      )
    );
  end loop;
  return null;
end;
$$;
revoke execute on function public.notify_event_rescheduled() from public, anon, authenticated;

create trigger events_notify_rescheduled
  after update of starts_at on public.events
  for each row execute function public.notify_event_rescheduled();
