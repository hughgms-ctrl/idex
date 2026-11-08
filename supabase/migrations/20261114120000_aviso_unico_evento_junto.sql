-- =============================================================================
-- Um aviso só para culto e ensaio juntos
--
-- Desde 20261113120000 o aviso do ensaio com a mesma chegada do culto vale
-- para os dois. Um segundo aviso no evento junto só duplicava o histórico
-- ("Mhariana avisou no culto" + "Mhariana avisou no ensaio"). Agora:
--  - gatilho barra o 2º aviso (pendente ou aprovado) no evento junto;
--  - leader_register_justification usa o aviso que já cobre o evento (do
--    próprio evento ou do junto) em vez de criar outro.
-- =============================================================================

create or replace function public.justifications_one_per_joint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select e.title into v_title
  from public.justifications j
  join public.events e on e.id = j.event_id
  where j.ministry_member_id = new.ministry_member_id
    and j.status in ('pending', 'approved')
    and public.events_joint(j.event_id, new.event_id)
  limit 1;
  if found then
    raise exception 'Você já avisou em "%", que tem a mesma chegada: o aviso vale para os dois', v_title
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger justifications_one_per_joint
  before insert on public.justifications
  for each row execute function public.justifications_one_per_joint();

create or replace function public.leader_register_justification(
  p_event_id uuid,
  p_ministry_member_id uuid,
  p_kind public.justification_kind,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_just  public.justifications%rowtype;
  v_mm    public.ministry_members%rowtype;
  v_note  text;
begin
  if not public.is_leader_of_member(p_ministry_member_id) then
    raise exception 'Só o líder do ministério registra justificativa por outra pessoa'
      using errcode = '42501';
  end if;
  select * into v_mm from public.ministry_members where id = p_ministry_member_id;
  if v_mm.user_id = auth.uid() then
    raise exception 'Para você mesmo, use "Avisar atraso ou falta"' using errcode = '22023';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.ministry_id <> v_mm.ministry_id then
    raise exception 'Evento não encontrado neste ministério' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escreva o motivo' using errcode = '22023';
  end if;

  v_note := 'Registrado pelo líder';

  -- aviso deste evento ou do evento junto (mesma chegada)
  v_just := public.covering_justification(p_event_id, p_ministry_member_id);

  if v_just.id is null then
    insert into public.justifications
      (church_id, event_id, ministry_member_id, kind, reason, status, created_by)
    values (v_event.church_id, p_event_id, p_ministry_member_id, p_kind, trim(p_reason),
            'pending', auth.uid())
    returning * into v_just;
  else
    if v_just.status = 'approved' then
      raise exception 'Já existe justificativa aprovada para este evento' using errcode = '22023';
    end if;
    perform 1 from public.justifications where id = v_just.id for update;
    v_note := case when v_just.status = 'rejected'
                   then 'Líder mudou de recusado para aprovado'
                   else 'Aprovado pelo líder' end;
    -- o líder pode corrigir tipo e motivo; o original fica no histórico
    update public.justifications
    set kind = p_kind, reason = trim(p_reason), status = 'pending',
        reviewed_by = null, reviewed_at = null, review_note = null
    where id = v_just.id;
  end if;

  perform public.review_justification(v_just.id, true, v_note);
  return v_just.id;
end;
$$;
