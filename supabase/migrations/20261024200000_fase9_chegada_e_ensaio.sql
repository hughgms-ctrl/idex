-- =============================================================================
-- Fase 9 — horário de chegada e ensaio de cada culto
--
-- * events.arrive_at: horário em que a equipe precisa chegar. Todas as regras
--   de horário (atraso, abertura do ponto, "esqueci de registrar") usam
--   coalesce(arrive_at, starts_at).
-- * events.service_event_id: o ensaio aponta para o culto dele (um por culto).
--   A equipe escalada no culto é copiada para o ensaio automaticamente.
-- * ministry_settings: padrões que o líder define (chegar X min antes do
--   culto; ensaio N dias antes, às HH:MM, com duração).
-- =============================================================================

alter table public.events
  add column arrive_at timestamptz,
  add column service_event_id uuid,
  add constraint events_arrive_before_start check (arrive_at is null or arrive_at <= starts_at),
  add constraint events_arrive_window check (arrive_at is null or arrive_at >= starts_at - interval '6 hours'),
  add constraint events_service_link_kind check (service_event_id is null or kind = 'rehearsal'),
  add constraint events_service_link_fk foreign key (service_event_id, church_id)
    references public.events (id, church_id) on delete cascade;
create unique index events_one_rehearsal_per_service on public.events (service_event_id)
  where service_event_id is not null;

-- O ensaio precisa ser do mesmo ministério, de um culto, e antes dele
create or replace function public.events_rehearsal_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.events%rowtype;
begin
  if new.service_event_id is null then
    return new;
  end if;
  select * into v_service from public.events where id = new.service_event_id;
  if v_service.ministry_id <> new.ministry_id or v_service.kind <> 'service' then
    raise exception 'O ensaio precisa ser de um culto do mesmo ministério' using errcode = '22023';
  end if;
  if new.starts_at >= v_service.starts_at then
    raise exception 'O ensaio precisa ser antes do culto' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.events_rehearsal_guard() from public, anon, authenticated;
create trigger events_rehearsal_guard
  before insert or update of service_event_id, starts_at, ministry_id, kind on public.events
  for each row execute function public.events_rehearsal_guard();

-- Padrões do ministério
alter table public.ministry_settings
  add column service_arrival_minutes  integer not null default 30 check (service_arrival_minutes between 0 and 360),
  add column rehearsal_enabled        boolean not null default true,
  add column rehearsal_days_before    integer not null default 3 check (rehearsal_days_before between 0 and 7),
  add column rehearsal_time           time    not null default '20:00',
  add column rehearsal_duration_min   integer not null default 120 check (rehearsal_duration_min between 15 and 600);
grant update (service_arrival_minutes, rehearsal_enabled, rehearsal_days_before, rehearsal_time, rehearsal_duration_min)
  on public.ministry_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Equipe do ensaio = equipe do culto (espelho automático)
-- -----------------------------------------------------------------------------
create or replace function public.mirror_service_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rehearsal uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select id into v_rehearsal from public.events where service_event_id = old.event_id;
    if v_rehearsal is not null then
      delete from public.schedule_assignments
      where event_id = v_rehearsal
        and ministry_member_id = old.ministry_member_id
        and ministry_role_id is not distinct from old.ministry_role_id;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select id into v_rehearsal from public.events where service_event_id = new.event_id;
    if v_rehearsal is not null and new.status <> 'declined' then
      insert into public.schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
      values (new.church_id, v_rehearsal, new.ministry_member_id, new.ministry_role_id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.mirror_service_assignments() from public, anon, authenticated;
create trigger schedule_assignments_mirror_rehearsal
  after insert or update of ministry_member_id, ministry_role_id, status or delete
  on public.schedule_assignments
  for each row execute function public.mirror_service_assignments();

-- Ensaio criado depois da escala: copia a equipe do culto
create or replace function public.copy_service_team_to_rehearsal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_event_id is not null
     and (tg_op = 'INSERT' or old.service_event_id is distinct from new.service_event_id) then
    insert into public.schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
    select sa.church_id, new.id, sa.ministry_member_id, sa.ministry_role_id
    from public.schedule_assignments sa
    where sa.event_id = new.service_event_id and sa.status <> 'declined'
    on conflict do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.copy_service_team_to_rehearsal() from public, anon, authenticated;
create trigger events_copy_service_team
  after insert or update of service_event_id on public.events
  for each row execute function public.copy_service_team_to_rehearsal();

-- -----------------------------------------------------------------------------
-- "Esqueci de registrar" passa a usar o horário de chegada
-- -----------------------------------------------------------------------------
create or replace function public.create_checkin_request(
  p_event_id            uuid,
  p_declared_arrived_at timestamptz,
  p_reason              text,
  p_device_location     jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event     public.events%rowtype;
  v_member_id uuid;
  v_settings  public.ministry_settings%rowtype;
  v_end       timestamptz;
  v_count     integer;
  v_id        uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Evento não encontrado' using errcode = 'P0002';
  end if;

  select mm.id into v_member_id
  from public.ministry_members mm
  join public.schedule_assignments sa on sa.ministry_member_id = mm.id and sa.event_id = p_event_id
  where mm.ministry_id = v_event.ministry_id and mm.user_id = auth.uid()
  limit 1;
  if v_member_id is null then
    raise exception 'Você não estava escalado neste evento' using errcode = '42501';
  end if;

  select * into v_settings from public.ministry_settings where ministry_id = v_event.ministry_id;
  v_end := public.event_end(v_event.starts_at, v_event.ends_at);

  -- horário de referência = chegada da equipe (ou o início, se não houver)
  if now() < coalesce(v_event.arrive_at, v_event.starts_at) then
    raise exception 'O evento ainda não começou' using errcode = '22023';
  end if;
  if now() > v_end + make_interval(hours => v_settings.checkin_request_deadline_hours) then
    raise exception 'O prazo para este pedido acabou (% horas após o evento)', v_settings.checkin_request_deadline_hours
      using errcode = '22023';
  end if;
  if p_declared_arrived_at < coalesce(v_event.arrive_at, v_event.starts_at) - interval '2 hours' or p_declared_arrived_at > v_end then
    raise exception 'O horário informado está fora do horário do evento' using errcode = '22023';
  end if;
  if exists (select 1 from public.checkins c where c.event_id = p_event_id and c.ministry_member_id = v_member_id) then
    raise exception 'Sua presença neste evento já está registrada' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Conte o que aconteceu (motivo)' using errcode = '22023';
  end if;

  -- pedidos do membro no mesmo ciclo (para o alerta do líder)
  select count(*) into v_count
  from public.checkin_requests r
  where r.ministry_member_id = v_member_id
    and public.cycle_for_event(r.event_id) = public.cycle_for_event(p_event_id);

  insert into public.checkin_requests (
    church_id, event_id, ministry_member_id, declared_arrived_at, reason, evidence
  ) values (
    v_event.church_id, p_event_id, v_member_id, p_declared_arrived_at, trim(p_reason),
    jsonb_build_object(
      'requests_in_cycle_before', v_count,
      'over_limit', v_count >= v_settings.checkin_request_limit_per_cycle,
      'device_location', p_device_location
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lembretes trazem o horário de chegada
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select sa.id as assignment_id, e.church_id, e.title, e.starts_at, e.arrive_at, e.kind, mm.user_id, r.name as role_name,
           (e.starts_at at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date as event_day,
           (now() at time zone coalesce(c.timezone, 'America/Sao_Paulo')) as local_now
    from public.schedule_assignments sa
    join public.events e on e.id = sa.event_id
    join public.churches c on c.id = e.church_id
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    left join public.ministry_roles r on r.id = sa.ministry_role_id
    where sa.status <> 'declined'
      and e.starts_at > now()
      and e.starts_at < now() + interval '3 days'
  loop
    if v_row.event_day = (v_row.local_now)::date + 2 then
      perform public.enqueue_notification(
        v_row.church_id, v_row.user_id, 'schedule_reminder', 'schedule:' || v_row.assignment_id,
        jsonb_build_object('eventTitle', v_row.title, 'eventStartsAt', v_row.starts_at, 'arriveAt', v_row.arrive_at, 'role', v_row.role_name)
      );
      v_count := v_count + 1;
    elsif v_row.kind = 'rehearsal' and v_row.event_day = (v_row.local_now)::date
          and extract(hour from v_row.local_now) >= 8 then
      perform public.enqueue_notification(
        v_row.church_id, v_row.user_id, 'rehearsal_today', 'rehearsal:' || v_row.assignment_id,
        jsonb_build_object('eventTitle', v_row.title, 'eventStartsAt', v_row.starts_at, 'arriveAt', v_row.arrive_at)
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
