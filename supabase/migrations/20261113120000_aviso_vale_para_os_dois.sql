-- =============================================================================
-- Aviso de falta/atraso vale também para o evento junto
--
-- Ensaio com a mesma chegada do culto (events_joint) já tem presença única e
-- "esqueci" único. O aviso (justifications) ainda valia só para o evento em que
-- foi enviado: quem avisou no ensaio levava falta no culto (−20 e "faltou" na
-- meta da equipe). Agora o aviso de um vale para o outro em:
--  - commitment_outcome (meta da equipe, sequência, selos, resumo do ciclo);
--  - process_absences (falta sem aviso e "fora do culto" por faltar ao ensaio);
--  - review_justification (devolve os descontos dos dois eventos);
--  - Edge Functions checkin e review-checkin-request (has_approved_justification);
--  - painel "Ao vivo" (justifications_for_event).
-- =============================================================================

-- Aviso que cobre o evento para a pessoa: o do próprio evento ou o do evento
-- junto. Aprovado vem antes de pendente; o do próprio evento vem antes.
create or replace function public.covering_justification(p_event_id uuid, p_member_id uuid)
returns public.justifications
language sql
stable
security definer
set search_path = ''
as $$
  select j.*
  from public.justifications j
  where j.ministry_member_id = p_member_id
    and (j.event_id = p_event_id or public.events_joint(j.event_id, p_event_id))
  order by case j.status when 'approved' then 0 when 'pending' then 1 else 2 end,
           (j.event_id = p_event_id) desc
  limit 1;
$$;

revoke all on function public.covering_justification(uuid, uuid) from public, anon, authenticated;

create or replace function public.has_approved_justification(p_event_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.covering_justification(p_event_id, p_member_id)).status = 'approved', false);
$$;

revoke all on function public.has_approved_justification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.has_approved_justification(uuid, uuid) to service_role;

-- Avisos que valem para o evento (o próprio e os do evento junto), com as
-- mesmas regras de leitura de justifications: a própria pessoa ou o líder.
create or replace function public.justifications_for_event(p_event_id uuid)
returns setof public.justifications
language sql
stable
security definer
set search_path = ''
as $$
  select j.*
  from public.justifications j
  where (j.event_id = p_event_id or public.events_joint(j.event_id, p_event_id))
    and (public.is_self_member(j.ministry_member_id) or public.is_leader_of_member(j.ministry_member_id));
$$;

revoke all on function public.justifications_for_event(uuid) from public, anon;
grant execute on function public.justifications_for_event(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Resultado do compromisso (meta da equipe, sequência, selos)
-- -----------------------------------------------------------------------------
create or replace function public.commitment_outcome(p_event_id uuid, p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with e as (
    select ev.id, coalesce(ev.ends_at, ev.starts_at + interval '2 hours') as ends_at
    from public.events ev where ev.id = p_event_id
  ),
  c as (
    select ch.late_minutes from public.checkins ch
    where ch.event_id = p_event_id and ch.ministry_member_id = p_member_id
  ),
  j as (
    select public.has_approved_justification(p_event_id, p_member_id) as approved
  )
  select case
    when exists (select 1 from c) then
      case
        when (select late_minutes from c) <= public.tolerance_for_event(p_event_id) then 'on_time'
        when (select approved from j) then 'excused'
        else 'late'
      end
    when now() < (select ends_at from e) then 'neutral'
    when (select approved from j) then 'excused'
    when exists (
      select 1 from public.checkin_requests r
      where r.event_id = p_event_id and r.ministry_member_id = p_member_id and r.status = 'pending'
    ) then 'neutral'
    when exists (
      select 1 from public.schedule_assignments sa
      where sa.event_id = p_event_id and sa.ministry_member_id = p_member_id
        and sa.status = 'benched'
    ) then 'neutral'
    else 'absent'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Faltas
-- -----------------------------------------------------------------------------
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
      -- aviso deste evento ou do evento junto
      and not exists (select 1 from public.justifications j
                      where j.ministry_member_id = sa.ministry_member_id
                        and (j.event_id = e.id or public.events_joint(j.event_id, e.id))
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
                   where j.ministry_member_id = sa.ministry_member_id
                     and (j.event_id = r.id or public.events_joint(j.event_id, r.id))
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
      and not exists (select 1 from public.checkin_requests q
                      where q.ministry_member_id = sa.ministry_member_id
                        and (q.event_id = r.id or public.events_joint(q.event_id, r.id))
                        and (q.status in ('approved', 'adjusted')
                             or (q.status = 'pending' and s.rehearsal_forgot_policy = 'keep_until_reviewed')))
      -- aviso aprovado (deste ensaio ou do evento junto): só segura se o líder
      -- escolheu "toca no culto"
      and not exists (select 1 from public.justifications j
                      where j.ministry_member_id = sa.ministry_member_id
                        and (j.event_id = r.id or public.events_joint(j.event_id, r.id))
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

-- -----------------------------------------------------------------------------
-- Análise do aviso: devolve os descontos do evento e do evento junto
-- -----------------------------------------------------------------------------
create or replace function public.review_justification(
  p_justification_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_just     public.justifications%rowtype;
  v_refund   integer;
  v_cycle_id uuid;
  v_ev       public.events%rowtype;
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

  if not p_approve then
    return;
  end if;

  for v_ev in
    select x.* from public.events x
    where x.id = v_just.event_id or public.events_joint(x.id, v_just.event_id)
  loop
    -- quem saiu do culto por faltar ao ensaio volta (conforme a regra do líder)
    if v_ev.service_event_id is not null and exists (
      select 1 from public.ministry_settings s
      where s.ministry_id = v_ev.ministry_id
        and (v_just.kind = 'late' or s.rehearsal_excused_policy = 'can_play')
    ) and exists (
      select 1 from public.schedule_assignments sa
      where sa.event_id = v_ev.id and sa.ministry_member_id = v_just.ministry_member_id
    ) then
      perform public.apply_late_consequence(v_ev.id, v_just.ministry_member_id, 'none');
    end if;

    -- devolve o que já foi descontado por atraso/falta neste evento
    select -coalesce(sum(pl.delta), 0)::integer, max(pl.cycle_id::text)::uuid
      into v_refund, v_cycle_id
    from public.point_ledger pl
    where pl.event_id = v_ev.id
      and pl.ministry_member_id = v_just.ministry_member_id
      and (pl.reason in ('late', 'absence')
           or (pl.reason = 'adjustment' and pl.note like 'Aviso aprovado%'));
    if v_refund > 0 and v_cycle_id is not null then
      insert into public.point_ledger (
        church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, note, created_by
      ) values (
        v_ev.church_id, v_ev.ministry_id, v_cycle_id, v_just.ministry_member_id, v_refund,
        'adjustment', v_ev.id,
        'Aviso aprovado: ' || case when v_just.kind = 'late' then 'atraso' else 'falta' end || ' sem desconto',
        auth.uid()
      );
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registro de presença (Edge Functions checkin e review-checkin-request): com
-- aviso aprovado deste evento ou do evento junto, o atraso não desconta. Fica
-- no banco para valer sem republicar as funções.
-- -----------------------------------------------------------------------------
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

  if p_delta < 0 and not public.has_approved_justification(p_event_id, p_ministry_member_id) then
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
