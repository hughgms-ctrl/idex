-- "Esqueci de registrar" com ensaio junto do culto (mesma chegada, até 5 min):
-- um pedido só vale para os dois, como a presença na Edge Function `checkin`.
--   - `events_joint(a, b)`: mesma família (culto + ensaios dele) e mesma chegada
--     (espelho de `jointEvents` em `_shared/domain/schedule.ts`).
--   - create_checkin_request: recusa um segundo pedido se já há um no evento junto.
--   - apply_checkin_request_review: aprovado/ajustado registra a presença também
--     nos eventos juntos em que a pessoa está escalada (sem desconto: o atraso
--     conta uma vez só, no evento do pedido).
--   - process_absences: o pedido do evento junto conta como pedido deste (não
--     dá falta nem tira do culto em dobro; recusado = uma falta só).

create or replace function public.events_joint(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events x
    join public.events y on y.id = p_b
    where x.id = p_a
      and x.id <> y.id
      and coalesce(x.service_event_id, x.id) = coalesce(y.service_event_id, y.id)
      and abs(extract(epoch from coalesce(x.arrive_at, x.starts_at) - coalesce(y.arrive_at, y.starts_at))) <= 300
  );
$$;

revoke all on function public.events_joint(uuid, uuid) from public, anon, authenticated;

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
  v_joint     text;
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
  -- ensaio junto do culto: o pedido de um já vale para o outro
  select e.title into v_joint
  from public.checkin_requests r
  join public.events e on e.id = r.event_id
  where r.ministry_member_id = v_member_id
    and public.events_joint(r.event_id, p_event_id)
  limit 1;
  if v_joint is not null then
    raise exception 'Seu pedido de "%" já vale para este evento (mesma chegada)', v_joint
      using errcode = '22023';
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

create or replace function public.apply_checkin_request_review(
  p_request_id   uuid,
  p_status       public.request_status,
  p_arrived_at   timestamptz,
  p_late_minutes integer,
  p_delta        integer,
  p_reviewer     uuid,
  p_note         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.checkin_requests%rowtype;
  v_event public.events%rowtype;
  v_joint uuid;
begin
  select * into v_req from public.checkin_requests where id = p_request_id for update;
  if not found then
    raise exception 'Pedido não encontrado' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Este pedido já foi analisado' using errcode = '22023';
  end if;
  if p_status = 'pending' then
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
  select * into v_event from public.events where id = v_req.event_id;

  update public.checkin_requests
  set status = p_status,
      adjusted_arrived_at = case when p_status = 'adjusted' then p_arrived_at end,
      reviewed_by = p_reviewer,
      reviewed_at = now(),
      review_note = p_note
  where id = p_request_id;

  if p_status in ('approved', 'adjusted') then
    perform public.record_attendance(
      v_req.event_id, v_req.ministry_member_id, p_arrived_at, p_late_minutes, p_delta, 'request',
      null, null, null, null, p_reviewer, p_request_id
    );
    -- ensaio junto do culto: a mesma presença, sem descontar de novo
    for v_joint in
      select e.id
      from public.events e
      join public.schedule_assignments sa
        on sa.event_id = e.id and sa.ministry_member_id = v_req.ministry_member_id
       and sa.status not in ('declined', 'benched')
      where public.events_joint(v_req.event_id, e.id)
        and not exists (select 1 from public.checkins c
                        where c.event_id = e.id and c.ministry_member_id = v_req.ministry_member_id)
      group by e.id
    loop
      perform public.record_attendance(
        v_joint, v_req.ministry_member_id, p_arrived_at, p_late_minutes, 0, 'request',
        null, null, null, null, p_reviewer, p_request_id
      );
    end loop;
  elsif p_delta < 0 then
    insert into public.point_ledger (
      church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, checkin_request_id,
      note, created_by
    ) values (
      v_event.church_id, v_event.ministry_id, public.cycle_for_event(v_event.id), v_req.ministry_member_id,
      p_delta, 'request_rejected', v_event.id, p_request_id, 'Pedido recusado: conta como falta', p_reviewer
    );
  end if;
end;
$$;

create or replace function public.process_absences()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_row   record;
begin
  with due as (
    select distinct e.id as event_id, e.church_id, e.ministry_id, sa.ministry_member_id, s.absence_penalty
    from public.events e
    join public.ministry_settings s on s.ministry_id = e.ministry_id
    join public.schedule_assignments sa on sa.event_id = e.id and sa.status not in ('declined', 'benched')
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    where e.starts_at > now() - interval '60 days'
      and public.event_end(e.starts_at, e.ends_at) + make_interval(hours => s.checkin_request_deadline_hours) < now()
      and not exists (select 1 from public.checkins c
                      where c.event_id = e.id and c.ministry_member_id = sa.ministry_member_id)
      -- pedido "esqueci" deste evento ou do evento junto (ensaio com a mesma chegada do culto)
      and not exists (select 1 from public.checkin_requests r
                      where r.ministry_member_id = sa.ministry_member_id
                        and (r.event_id = e.id or public.events_joint(r.event_id, e.id))
                        and r.status in ('pending', 'approved', 'adjusted', 'rejected'))
      and not exists (select 1 from public.justifications j
                      where j.event_id = e.id and j.ministry_member_id = sa.ministry_member_id
                        and j.status in ('pending', 'approved'))
  ),
  ins as (
    insert into public.point_ledger (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, note)
    select d.church_id, d.ministry_id, public.cycle_for_event(d.event_id), d.ministry_member_id,
           -d.absence_penalty, 'absence', d.event_id, 'Falta sem aviso'
    from due d
    where d.absence_penalty > 0 and public.cycle_for_event(d.event_id) is not null
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  -- Quem não bateu o ponto no ensaio sai do culto (regra "fora do ensaio e do
  -- culto"), conforme as decisões do líder sobre pedidos e avisos de falta.
  for v_row in
    select r.id as rehearsal_id, sa.ministry_member_id,
           exists (select 1 from public.justifications j
                   where j.event_id = r.id and j.ministry_member_id = sa.ministry_member_id
                     and j.kind = 'absence' and j.status = 'approved') as excused
    from public.events r
    join public.events c on c.id = r.service_event_id and c.starts_at > now()
    join public.ministry_settings s on s.ministry_id = r.ministry_id
      and s.rehearsal_late_consequence = 'out_rehearsal_and_service'
    join public.schedule_assignments sa on sa.event_id = r.id and sa.status in ('scheduled', 'confirmed')
    where public.event_end(r.starts_at, r.ends_at) < now()
      and r.starts_at > now() - interval '14 days'
      and not exists (select 1 from public.checkins ch
                      where ch.event_id = r.id and ch.ministry_member_id = sa.ministry_member_id)
      -- pedido "esqueci" (deste ensaio ou do evento junto): aprovado sempre
      -- segura; pendente só se o líder escolheu esperar
      and not exists (select 1 from public.checkin_requests q
                      where q.ministry_member_id = sa.ministry_member_id
                        and (q.event_id = r.id or public.events_joint(q.event_id, r.id))
                        and (q.status in ('approved', 'adjusted')
                             or (q.status = 'pending' and s.rehearsal_forgot_policy = 'keep_until_reviewed')))
      -- aviso de falta aprovado: só segura se o líder escolheu "toca no culto"
      and not exists (select 1 from public.justifications j
                      where j.event_id = r.id and j.ministry_member_id = sa.ministry_member_id
                        and j.status = 'approved'
                        and (j.kind = 'late' or s.rehearsal_excused_policy = 'can_play'))
  loop
    perform public.apply_late_consequence(v_row.rehearsal_id, v_row.ministry_member_id,
      'event_and_service',
      case when v_row.excused then 'Faltou ao ensaio (com aviso)' else 'Faltou ao ensaio' end);
  end loop;

  return v_count;
end;
$$;
