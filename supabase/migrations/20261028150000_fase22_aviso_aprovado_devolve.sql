-- =============================================================================
-- Fase 22 — aviso de atraso/falta aprovado depois do desconto devolve os pontos
--
-- O desconto de atraso cai na hora do registro de presença (e o de falta no
-- job). Se o aviso ainda estava pendente nessa hora e o líder aprova depois, o
-- ledger recebe um "ajuste" positivo com o mesmo valor (o ledger só aceita
-- inclusão; o saldo volta pela soma).
-- =============================================================================
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
  v_event    public.events%rowtype;
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

  -- devolve o que já foi descontado por atraso/falta neste evento
  if p_approve then
    select -coalesce(sum(pl.delta), 0)::integer, max(pl.cycle_id::text)::uuid
      into v_refund, v_cycle_id
    from public.point_ledger pl
    where pl.event_id = v_just.event_id
      and pl.ministry_member_id = v_just.ministry_member_id
      and (pl.reason in ('late', 'absence')
           or (pl.reason = 'adjustment' and pl.note like 'Aviso aprovado%'));
    if v_refund > 0 and v_cycle_id is not null then
      select * into v_event from public.events where id = v_just.event_id;
      insert into public.point_ledger (
        church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, note, created_by
      ) values (
        v_event.church_id, v_event.ministry_id, v_cycle_id, v_just.ministry_member_id, v_refund,
        'adjustment', v_just.event_id,
        'Aviso aprovado: ' || case when v_just.kind = 'late' then 'atraso' else 'falta' end || ' sem desconto',
        auth.uid()
      );
    end if;
  end if;
end;
$$;
