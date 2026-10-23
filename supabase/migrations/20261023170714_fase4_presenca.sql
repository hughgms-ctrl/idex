-- =============================================================================
-- Fase 4 — Presença e pontos
--
-- Quem escreve o quê:
--   * Check-in pelo QR e revisão de pedidos: Edge Functions (`checkin`,
--     `review-checkin-request`) calculam com as regras puras de
--     `_shared/domain/points.ts` e gravam por funções `service_role` abaixo.
--   * Pedido "esqueci de registrar" e revisão de justificativas: RPCs.
--   * Faltas sem aviso e fechamento de ciclo: funções chamadas pelo pg_cron.
-- O cliente continua sem INSERT/UPDATE em checkins, point_ledger e
-- cycle_eligibility.
-- =============================================================================

comment on column public.ministry_settings.late_penalty_tiers is
  'Faixas de desconto pelo atraso TOTAL em minutos (só valem depois da tolerância). '
  'Ex.: [{"upToMin":20,"points":5},{"upToMin":null,"points":10}] = 11–20 min −5; acima −10.';

-- -----------------------------------------------------------------------------
-- Tentativas de check-in (evidência para o líder; escrito só pelo servidor)
-- -----------------------------------------------------------------------------
create table public.checkin_attempts (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  event_id           uuid not null,
  ministry_member_id uuid not null,
  attempted_at       timestamptz not null default now(),
  lat                double precision,
  lng                double precision,
  accuracy_m         double precision,
  distance_m         double precision,
  outcome            text not null, -- ok | outside_radius | invalid_qr | no_location | not_scheduled | ...
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade
);
create index checkin_attempts_event_member_idx on public.checkin_attempts (event_id, ministry_member_id);
create index checkin_attempts_church_idx on public.checkin_attempts (church_id);

alter table public.checkin_attempts enable row level security;
create policy checkin_attempts_select on public.checkin_attempts
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
revoke insert, update, delete on public.checkin_attempts from authenticated;

-- Um lançamento de falta/atraso por pessoa e evento (idempotência dos jobs)
create unique index point_ledger_one_event_penalty
  on public.point_ledger (event_id, ministry_member_id)
  where reason in ('late', 'absence', 'request_rejected') and event_id is not null;

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------

-- Ciclo ao qual um evento pertence (pela data no fuso da igreja); se não
-- houver, o ciclo aberto do ministério.
create or replace function public.cycle_for_event(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with ev as (
    select e.ministry_id, (e.starts_at at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date as d
    from public.events e
    join public.churches c on c.id = e.church_id
    where e.id = p_event_id
  )
  select coalesce(
    (select cy.id from public.cycles cy, ev
      where cy.ministry_id = ev.ministry_id and cy.starts_on <= ev.d and cy.ends_on >= ev.d
      order by cy.starts_on desc limit 1),
    (select cy.id from public.cycles cy, ev
      where cy.ministry_id = ev.ministry_id and cy.status = 'open' limit 1)
  );
$$;

-- Fim do evento (padrão: 2h após o início)
create or replace function public.event_end(p_starts_at timestamptz, p_ends_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_ends_at, p_starts_at + interval '2 hours');
$$;

-- -----------------------------------------------------------------------------
-- Gravações do servidor (somente service_role / Edge Functions)
-- -----------------------------------------------------------------------------

-- Registra a chegada e, se houver desconto, o lançamento no ledger.
create or replace function public.record_attendance(
  p_event_id           uuid,
  p_ministry_member_id uuid,
  p_arrived_at         timestamptz,
  p_late_minutes       integer,
  p_delta              integer,
  p_source             public.checkin_source,
  p_lat                double precision default null,
  p_lng                double precision default null,
  p_accuracy_m         double precision default null,
  p_distance_m         double precision default null,
  p_actor              uuid default null,
  p_request_id         uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event      public.events%rowtype;
  v_checkin_id uuid;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Evento não encontrado' using errcode = 'P0002';
  end if;
  if p_delta > 0 then
    raise exception 'Presença não soma pontos' using errcode = '22023';
  end if;

  insert into public.checkins (
    church_id, event_id, ministry_member_id, arrived_at, lat, lng, accuracy_m, distance_m, late_minutes, source
  ) values (
    v_event.church_id, p_event_id, p_ministry_member_id, p_arrived_at, p_lat, p_lng, p_accuracy_m,
    p_distance_m, greatest(p_late_minutes, 0), p_source
  )
  returning id into v_checkin_id;

  if p_delta < 0 then
    insert into public.point_ledger (
      church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, checkin_id,
      checkin_request_id, note, created_by
    ) values (
      v_event.church_id, v_event.ministry_id, public.cycle_for_event(p_event_id), p_ministry_member_id,
      p_delta, 'late', p_event_id, v_checkin_id, p_request_id,
      format('Atraso de %s min', p_late_minutes), p_actor
    );
  end if;

  return v_checkin_id;
end;
$$;

create or replace function public.log_checkin_attempt(
  p_event_id           uuid,
  p_ministry_member_id uuid,
  p_outcome            text,
  p_lat                double precision default null,
  p_lng                double precision default null,
  p_accuracy_m         double precision default null,
  p_distance_m         double precision default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.checkin_attempts (church_id, event_id, ministry_member_id, outcome, lat, lng, accuracy_m, distance_m)
  select e.church_id, p_event_id, p_ministry_member_id, left(p_outcome, 40), p_lat, p_lng, p_accuracy_m, p_distance_m
  from public.events e where e.id = p_event_id;
$$;

-- Aplica a decisão do líder sobre um pedido "esqueci de registrar".
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

-- -----------------------------------------------------------------------------
-- RPCs do app
-- -----------------------------------------------------------------------------

-- Membro: "esqueci de registrar" (até N horas após o fim do evento).
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

  if now() < v_event.starts_at then
    raise exception 'O evento ainda não começou' using errcode = '22023';
  end if;
  if now() > v_end + make_interval(hours => v_settings.checkin_request_deadline_hours) then
    raise exception 'O prazo para este pedido acabou (% horas após o evento)', v_settings.checkin_request_deadline_hours
      using errcode = '22023';
  end if;
  if p_declared_arrived_at < v_event.starts_at - interval '2 hours' or p_declared_arrived_at > v_end then
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

-- Líder: aprova ou recusa justificativa enviada antes do evento.
create or replace function public.review_justification(
  p_justification_id uuid,
  p_approve          boolean,
  p_note             text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_just public.justifications%rowtype;
begin
  select * into v_just from public.justifications where id = p_justification_id for update;
  if not found then
    raise exception 'Justificativa não encontrada' using errcode = 'P0002';
  end if;
  if not public.is_leader_of_member(v_just.ministry_member_id) then
    raise exception 'Só o líder do ministério decide' using errcode = '42501';
  end if;
  if v_just.status <> 'pending' then
    raise exception 'Esta justificativa já foi analisada' using errcode = '22023';
  end if;
  update public.justifications
  set status = case when p_approve then 'approved'::public.justification_status else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_note
  where id = p_justification_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Jobs (pg_cron)
-- -----------------------------------------------------------------------------

-- Falta sem aviso: escalado que não registrou presença, sem pedido pendente
-- e sem justificativa aprovada, depois do prazo de pedidos. Idempotente.
create or replace function public.process_absences()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select distinct e.id as event_id, e.church_id, e.ministry_id, sa.ministry_member_id, s.absence_penalty
    from public.events e
    join public.ministry_settings s on s.ministry_id = e.ministry_id
    join public.schedule_assignments sa on sa.event_id = e.id and sa.status <> 'declined'
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    where e.starts_at > now() - interval '60 days'
      and public.event_end(e.starts_at, e.ends_at) + make_interval(hours => s.checkin_request_deadline_hours) < now()
      and not exists (select 1 from public.checkins c
                      where c.event_id = e.id and c.ministry_member_id = sa.ministry_member_id)
      and not exists (select 1 from public.checkin_requests r
                      where r.event_id = e.id and r.ministry_member_id = sa.ministry_member_id
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
  return v_count;
end;
$$;

-- Ciclos: (1) terminou → "fechando" e abre o próximo com saldo cheio;
-- (2) depois do prazo dos pedidos → calcula elegibilidade e fecha.
create or replace function public.close_due_cycles()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle    record;
  v_new_id   uuid;
  v_closed   integer := 0;
begin
  for v_cycle in
    select cy.*, s.cycle_months, s.cycle_starting_points, coalesce(ch.timezone, 'America/Sao_Paulo') as tz
    from public.cycles cy
    join public.ministry_settings s on s.ministry_id = cy.ministry_id
    join public.churches ch on ch.id = cy.church_id
    where cy.status = 'open' and cy.ends_on < (now() at time zone coalesce(ch.timezone, 'America/Sao_Paulo'))::date
    for update of cy
  loop
    update public.cycles set status = 'closing' where id = v_cycle.id;

    insert into public.cycles (church_id, ministry_id, starts_on, ends_on, status)
    values (
      v_cycle.church_id, v_cycle.ministry_id, v_cycle.ends_on + 1,
      ((v_cycle.ends_on + 1) + make_interval(months => v_cycle.cycle_months) - interval '1 day')::date,
      'open'
    )
    on conflict (ministry_id, starts_on) do nothing
    returning id into v_new_id;

    if v_new_id is not null then
      insert into public.point_ledger (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, note)
      select mm.church_id, mm.ministry_id, v_new_id, mm.id, v_cycle.cycle_starting_points, 'cycle_start',
             'Saldo inicial do ciclo'
      from public.ministry_members mm
      where mm.ministry_id = v_cycle.ministry_id and mm.status = 'active';
    end if;
  end loop;

  -- faltas pendentes entram antes de calcular a elegibilidade
  perform public.process_absences();

  for v_cycle in
    select cy.*, s.cycle_min_points, s.checkin_request_deadline_hours,
           coalesce(ch.timezone, 'America/Sao_Paulo') as tz
    from public.cycles cy
    join public.ministry_settings s on s.ministry_id = cy.ministry_id
    join public.churches ch on ch.id = cy.church_id
    where cy.status = 'closing'
      and (cy.ends_on + 1)::timestamp at time zone coalesce(ch.timezone, 'America/Sao_Paulo')
          + make_interval(hours => s.checkin_request_deadline_hours + 2) < now()
      -- espera os pedidos pendentes do ciclo serem analisados
      and not exists (
        select 1 from public.checkin_requests r
        where r.status = 'pending' and public.cycle_for_event(r.event_id) = cy.id
      )
    for update of cy
  loop
    insert into public.cycle_eligibility (church_id, ministry_id, cycle_id, ministry_member_id, balance, eligible)
    select mm.church_id, mm.ministry_id, v_cycle.id, mm.id, coalesce(b.total, 0),
           coalesce(b.total, 0) >= v_cycle.cycle_min_points
    from public.ministry_members mm
    left join (
      select pl.ministry_member_id, sum(pl.delta)::integer as total
      from public.point_ledger pl
      where pl.cycle_id = v_cycle.id
      group by pl.ministry_member_id
    ) b on b.ministry_member_id = mm.id
    where mm.ministry_id = v_cycle.ministry_id
      and (mm.status = 'active' or b.total is not null)
    on conflict (cycle_id, ministry_member_id) do update
      set balance = excluded.balance, eligible = excluded.eligible, computed_at = now();

    update public.cycles set status = 'closed', closed_at = now() where id = v_cycle.id;
    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
revoke execute on function
  public.cycle_for_event(uuid),
  public.event_end(timestamptz, timestamptz),
  public.record_attendance(uuid, uuid, timestamptz, integer, integer, public.checkin_source, double precision, double precision, double precision, double precision, uuid, uuid),
  public.log_checkin_attempt(uuid, uuid, text, double precision, double precision, double precision, double precision),
  public.apply_checkin_request_review(uuid, public.request_status, timestamptz, integer, integer, uuid, text),
  public.create_checkin_request(uuid, timestamptz, text, jsonb),
  public.review_justification(uuid, boolean, text),
  public.process_absences(),
  public.close_due_cycles()
from public, anon, authenticated;

grant execute on function
  public.record_attendance(uuid, uuid, timestamptz, integer, integer, public.checkin_source, double precision, double precision, double precision, double precision, uuid, uuid),
  public.log_checkin_attempt(uuid, uuid, text, double precision, double precision, double precision, double precision),
  public.apply_checkin_request_review(uuid, public.request_status, timestamptz, integer, integer, uuid, text),
  public.cycle_for_event(uuid),
  public.process_absences(),
  public.close_due_cycles()
to service_role;

grant execute on function
  public.create_checkin_request(uuid, timestamptz, text, jsonb),
  public.review_justification(uuid, boolean, text),
  public.event_end(timestamptz, timestamptz)
to authenticated;

-- -----------------------------------------------------------------------------
-- Agendamento (pg_cron): faltas a cada 15 min; ciclos todo dia às 03:17 (SP)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('idex-processar-faltas', '*/15 * * * *', 'select public.process_absences()');
select cron.schedule('idex-fechar-ciclos', '17 6 * * *', 'select public.close_due_cycles()');
