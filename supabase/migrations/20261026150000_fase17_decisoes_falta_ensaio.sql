-- Fase 17 — decisões do líder sobre falta no ensaio (valem quando a regra do
-- ensaio é "fora do ensaio e do culto"):
--   rehearsal_forgot_policy:  quem não bateu o ponto e pediu "esqueci"
--     'out_until_approved'  (padrão) fica fora até o líder aprovar
--     'keep_until_reviewed'          continua escalado enquanto o pedido espera
--   rehearsal_excused_policy: quem avisou a falta no ensaio e o líder aprovou
--     'can_play'            (padrão) toca no culto mesmo assim
--     'out_of_service'               sem ensaio, sem culto

alter table public.ministry_settings
  add column rehearsal_forgot_policy text not null default 'out_until_approved'
    check (rehearsal_forgot_policy in ('out_until_approved', 'keep_until_reviewed')),
  add column rehearsal_excused_policy text not null default 'can_play'
    check (rehearsal_excused_policy in ('can_play', 'out_of_service'));

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
      -- pedido "esqueci": aprovado sempre segura; pendente só se o líder escolheu esperar
      and not exists (select 1 from public.checkin_requests q
                      where q.event_id = r.id and q.ministry_member_id = sa.ministry_member_id
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

-- Aviso de falta no ensaio aprovado depois que a pessoa já saiu do culto:
-- com "toca no culto", ela volta para a escala.
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

  if p_approve and exists (
    select 1 from public.events r
    join public.ministry_settings s on s.ministry_id = r.ministry_id
    where r.id = v_just.event_id and r.service_event_id is not null
      and (v_just.kind = 'late' or s.rehearsal_excused_policy = 'can_play')
  ) then
    perform public.apply_late_consequence(v_just.event_id, v_just.ministry_member_id, 'none');
  end if;
end;
$$;

-- o líder edita as duas escolhas (update por coluna, como as outras regras)
grant update (rehearsal_forgot_policy, rehearsal_excused_policy)
  on public.ministry_settings to authenticated;
