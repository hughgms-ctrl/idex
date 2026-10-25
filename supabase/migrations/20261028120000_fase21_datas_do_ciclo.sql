-- =============================================================================
-- Fase 21 — o líder escolhe as datas do ciclo de pontos
--
-- O ciclo atual passa a ter início e fim escolhidos pelo líder (atalhos de 3 ou
-- 6 meses ou uma data específica) e `cycle_months` vira o tamanho dos PRÓXIMOS
-- ciclos (cada um começa no dia seguinte ao fim do anterior).
--
-- Os pontos contam a partir do início do ciclo: evento antes do início não
-- entra em ciclo nenhum (antes, caía no ciclo aberto).
-- =============================================================================

-- Evento → ciclo. Sem ciclo que cubra a data: só usa o ciclo aberto se o evento
-- for depois do início dele (o job de fechar ciclos ainda não rodou).
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
      where cy.ministry_id = ev.ministry_id and cy.status = 'open' and cy.starts_on <= ev.d
      limit 1)
  );
$$;

-- Lançamento de evento fora de qualquer ciclo (antes do início) é ignorado
-- em vez de quebrar o registro de presença.
create or replace function public.point_ledger_skip_without_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cycle_id is null then
    return null;
  end if;
  return new;
end;
$$;
create trigger point_ledger_skip_without_cycle
  before insert on public.point_ledger
  for each row execute function public.point_ledger_skip_without_cycle();
revoke execute on function public.point_ledger_skip_without_cycle() from public, anon, authenticated;

-- O líder define o ciclo atual e o tamanho dos próximos
create or replace function public.set_current_cycle(
  p_ministry_id uuid,
  p_starts_on   date,
  p_ends_on     date,
  p_next_months integer
)
returns public.cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today    date;
  v_prev_end date;
  v_cycle    public.cycles;
begin
  if not public.is_ministry_leader(p_ministry_id) then
    raise exception 'Só o líder do ministério muda o ciclo' using errcode = '42501';
  end if;
  if p_next_months is null or p_next_months not between 1 and 12 then
    raise exception 'Os próximos ciclos precisam ter de 1 a 12 meses' using errcode = '22023';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on <= p_starts_on then
    raise exception 'O fim precisa ser depois do início' using errcode = '22023';
  end if;
  if p_ends_on > (p_starts_on + interval '24 months')::date then
    raise exception 'O ciclo pode ter no máximo 24 meses' using errcode = '22023';
  end if;

  select (now() at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date into v_today
  from public.ministries m join public.churches c on c.id = m.church_id
  where m.id = p_ministry_id;
  if p_ends_on < v_today then
    raise exception 'O fim do ciclo atual não pode ficar no passado' using errcode = '22023';
  end if;

  select max(ends_on) into v_prev_end
  from public.cycles where ministry_id = p_ministry_id and status <> 'open';
  if v_prev_end is not null and p_starts_on <= v_prev_end then
    raise exception 'O ciclo anterior foi até %: comece depois disso', to_char(v_prev_end, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  update public.cycles
  set starts_on = p_starts_on, ends_on = p_ends_on
  where ministry_id = p_ministry_id and status = 'open'
  returning * into v_cycle;
  if not found then
    raise exception 'Nenhum ciclo aberto neste ministério' using errcode = 'P0002';
  end if;

  update public.ministry_settings set cycle_months = p_next_months where ministry_id = p_ministry_id;
  return v_cycle;
end;
$$;
revoke execute on function public.set_current_cycle(uuid, date, date, integer) from public, anon;
grant execute on function public.set_current_cycle(uuid, date, date, integer) to authenticated;
