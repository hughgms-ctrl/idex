-- =============================================================================
-- Fase 24 — gamificação da presença
--
-- - Recuperar pontos (opcional por ministério): a cada N presenças no horário
--   depois do último desconto, volta +X (sem passar dos pontos iniciais).
--   Lançado no ledger como 'recovery' por gatilho em `checkins`.
-- - Meta da equipe: % no horário do mês e destaques (só quem foi 100% no
--   horário), por `ministry_month_stats`.
-- - Resumo do ciclo: ao fechar, cada um recebe um aviso com os números.
-- - Combinados do ministério: texto livre do líder, lido pela equipe.
--
-- Resultado de cada compromisso (mesma regra de `_shared/domain/gamification.ts`):
-- on_time | late | excused | absent | neutral.
-- =============================================================================

alter type public.point_reason add value if not exists 'recovery';

alter table public.ministry_settings
  add column recovery_enabled boolean not null default false,
  add column recovery_every integer not null default 5 check (recovery_every between 2 and 20),
  add column recovery_points integer not null default 5 check (recovery_points between 1 and 50),
  add column team_ontime_goal integer not null default 95 check (team_ontime_goal between 50 and 100),
  -- "Combinados do ministério": texto livre do líder (oração, jejum, roupa…),
  -- mostrado na Presença junto das regras que o app aplica
  add column team_agreements text not null default '' check (length(team_agreements) <= 4000);

grant update (recovery_enabled, recovery_every, recovery_points, team_ontime_goal, team_agreements)
  on public.ministry_settings to authenticated;

-- Tolerância do tipo de evento (culto e ensaio têm a sua; outros, a geral)
create or replace function public.tolerance_for_event(p_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case e.kind
           when 'service' then s.service_tolerance_min
           when 'rehearsal' then s.rehearsal_tolerance_min
           else s.late_tolerance_min
         end
  from public.events e
  join public.ministry_settings s on s.ministry_id = e.ministry_id
  where e.id = p_event_id;
$$;

-- Resultado de um compromisso (escala) de uma pessoa
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
    select exists (
      select 1 from public.justifications js
      where js.event_id = p_event_id and js.ministry_member_id = p_member_id
        and js.status = 'approved'
    ) as approved
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
-- Recuperar pontos
-- -----------------------------------------------------------------------------
create or replace function public.maybe_award_recovery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event    public.events%rowtype;
  v_settings public.ministry_settings%rowtype;
  v_cycle    uuid;
  v_balance  integer;
  v_anchor   timestamptz;
  v_count    integer;
  v_points   integer;
  v_ledger   uuid;
  v_profile  uuid;
begin
  if new.late_minutes > coalesce(public.tolerance_for_event(new.event_id), 0) then
    return null;
  end if;
  select * into v_event from public.events where id = new.event_id;
  select * into v_settings from public.ministry_settings where ministry_id = v_event.ministry_id;
  if not coalesce(v_settings.recovery_enabled, false) then
    return null;
  end if;
  v_cycle := public.cycle_for_event(new.event_id);
  if v_cycle is null then
    return null;
  end if;

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.point_ledger
  where cycle_id = v_cycle and ministry_member_id = new.ministry_member_id;
  if v_balance >= v_settings.cycle_starting_points then
    return null;
  end if;

  -- conta a partir do último desconto ou da última recuperação
  select max(coalesce(e.starts_at, pl.created_at)) into v_anchor
  from public.point_ledger pl
  left join public.events e on e.id = pl.event_id
  where pl.cycle_id = v_cycle and pl.ministry_member_id = new.ministry_member_id
    and (pl.reason = 'recovery' or (pl.delta < 0 and pl.reason <> 'cycle_start'));

  select count(*)::integer into v_count
  from public.checkins ch
  join public.events e on e.id = ch.event_id
  where ch.ministry_member_id = new.ministry_member_id
    and e.starts_at > coalesce(v_anchor, '-infinity'::timestamptz)
    and public.cycle_for_event(e.id) = v_cycle
    and ch.late_minutes <= coalesce(public.tolerance_for_event(e.id), 0);

  if v_count < v_settings.recovery_every then
    return null;
  end if;

  v_points := least(v_settings.recovery_points, v_settings.cycle_starting_points - v_balance);
  insert into public.point_ledger (
    church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, event_id, checkin_id, note
  ) values (
    new.church_id, v_event.ministry_id, v_cycle, new.ministry_member_id, v_points, 'recovery',
    new.event_id, new.id,
    'Recuperação: ' || v_settings.recovery_every || ' presenças seguidas no horário'
  ) returning id into v_ledger;

  select user_id into v_profile from public.ministry_members where id = new.ministry_member_id;
  perform public.enqueue_notification(
    new.church_id, v_profile, 'announcement', 'recovery:' || v_ledger,
    jsonb_build_object(
      'title', 'Você recuperou +' || v_points || ' pontos',
      'body', v_settings.recovery_every || ' presenças seguidas no horário. Seu saldo agora: '
              || (v_balance + v_points) || ' pontos.',
      'path', '/presenca',
      'pushOnly', true
    )
  );
  return null;
end;
$$;

create trigger checkins_award_recovery
  after insert on public.checkins
  for each row execute function public.maybe_award_recovery();

-- -----------------------------------------------------------------------------
-- Meta da equipe no mês (São Paulo) e destaques
-- -----------------------------------------------------------------------------
create or replace function public.ministry_month_stats(p_ministry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with month as (
    select (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' as starts
  ),
  rows as (
    select sa.ministry_member_id, public.commitment_outcome(e.id, sa.ministry_member_id) as outcome
    from public.schedule_assignments sa
    join public.events e on e.id = sa.event_id
    where e.ministry_id = p_ministry_id
      and sa.status <> 'declined'
      and e.starts_at >= (select starts from month)
      and e.starts_at <= now()
  ),
  people as (
    select r.ministry_member_id,
           count(*) filter (where r.outcome = 'on_time') as on_time,
           count(*) filter (where r.outcome in ('late', 'absent')) as missed
    from rows r group by r.ministry_member_id
  )
  select case
    when public.is_ministry_member(p_ministry_id) or public.is_ministry_leader(p_ministry_id) then
      jsonb_build_object(
        'on_time', (select count(*) from rows where outcome = 'on_time'),
        'late', (select count(*) from rows where outcome = 'late'),
        'absent', (select count(*) from rows where outcome = 'absent'),
        'goal', (select team_ontime_goal from public.ministry_settings where ministry_id = p_ministry_id),
        'highlights', coalesce((
          select jsonb_agg(x.name order by x.on_time desc, x.name)
          from (
            select coalesce(nullif(trim(pr.full_name), ''), 'Sem nome') as name, p.on_time
            from people p
            join public.ministry_members mm on mm.id = p.ministry_member_id
            join public.profiles pr on pr.id = mm.user_id
            where p.missed = 0 and p.on_time >= 2 and mm.status = 'active'
            order by p.on_time desc, pr.full_name
            limit 8
          ) x
        ), '[]'::jsonb)
      )
    else null
  end;
$$;

-- -----------------------------------------------------------------------------
-- Resumo do ciclo, enviado a cada um quando o ciclo fecha
-- -----------------------------------------------------------------------------
create or replace function public.member_cycle_summary(p_member_id uuid, p_cycle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row     record;
  v_current integer := 0;
  v_best    integer := 0;
  v_on_time integer := 0;
  v_late    integer := 0;
  v_absent  integer := 0;
  v_excused integer := 0;
begin
  for v_row in
    select public.commitment_outcome(e.id, sa.ministry_member_id) as outcome
    from public.schedule_assignments sa
    join public.events e on e.id = sa.event_id
    where sa.ministry_member_id = p_member_id
      and sa.status <> 'declined'
      and public.cycle_for_event(e.id) = p_cycle_id
    order by e.starts_at
  loop
    if v_row.outcome = 'on_time' then
      v_on_time := v_on_time + 1;
      v_current := v_current + 1;
      v_best := greatest(v_best, v_current);
    elsif v_row.outcome in ('late', 'absent') then
      v_current := 0;
      if v_row.outcome = 'late' then v_late := v_late + 1; else v_absent := v_absent + 1; end if;
    elsif v_row.outcome = 'excused' then
      v_excused := v_excused + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'on_time', v_on_time, 'late', v_late, 'absent', v_absent, 'excused', v_excused,
    'best_streak', v_best,
    'balance', (
      select coalesce(sum(delta), 0)::integer from public.point_ledger
      where cycle_id = p_cycle_id and ministry_member_id = p_member_id
    )
  );
end;
$$;

create or replace function public.notify_cycle_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min     integer;
  v_row     record;
  v_sum     jsonb;
  v_total   integer;
  v_rate    text;
  v_body    text;
begin
  if new.status <> 'closed' or old.status = 'closed' then
    return null;
  end if;
  select cycle_min_points into v_min from public.ministry_settings where ministry_id = new.ministry_id;

  for v_row in
    select ce.ministry_member_id, ce.eligible, ce.balance, mm.user_id
    from public.cycle_eligibility ce
    join public.ministry_members mm on mm.id = ce.ministry_member_id
    where ce.cycle_id = new.id and mm.status = 'active'
  loop
    v_sum := public.member_cycle_summary(v_row.ministry_member_id, new.id);
    v_total := (v_sum->>'on_time')::int + (v_sum->>'late')::int + (v_sum->>'absent')::int;
    v_rate := case when v_total > 0
                then ' (' || round(100.0 * (v_sum->>'on_time')::int / v_total) || '%)'
                else '' end;
    v_body := 'De ' || to_char(new.starts_on, 'DD/MM') || ' a ' || to_char(new.ends_on, 'DD/MM') || ': ';
    if v_total + (v_sum->>'excused')::int > 0 then
      v_body := v_body
        || (v_sum->>'on_time') || ' no horário' || v_rate || ', '
        || case (v_sum->>'late')::int when 0 then 'nenhum atraso' when 1 then '1 atraso'
                else (v_sum->>'late') || ' atrasos' end || ', '
        || case (v_sum->>'absent')::int when 0 then 'nenhuma falta sem aviso'
                when 1 then '1 falta sem aviso' else (v_sum->>'absent') || ' faltas sem aviso' end
        || '. Maior sequência no horário: ' || (v_sum->>'best_streak') || '. ';
    end if;
    v_body := v_body || 'Saldo final: ' || v_row.balance || ' pontos — '
      || case when v_row.eligible then 'você continua na escala do próximo ciclo.'
              else 'ficou abaixo do mínimo (' || v_min || ').' end
      || ' Veja seus selos no app.';
    perform public.enqueue_notification(
      new.church_id, v_row.user_id, 'announcement',
      'cycle-summary:' || new.id || ':' || v_row.ministry_member_id,
      jsonb_build_object('title', 'Seu ciclo terminou', 'body', v_body, 'path', '/presenca')
    );
  end loop;
  return null;
end;
$$;

create trigger cycles_notify_summary
  after update of status on public.cycles
  for each row execute function public.notify_cycle_summary();

revoke execute on function
  public.tolerance_for_event(uuid),
  public.commitment_outcome(uuid, uuid),
  public.maybe_award_recovery(),
  public.member_cycle_summary(uuid, uuid),
  public.notify_cycle_summary()
from public, anon, authenticated;

revoke execute on function public.ministry_month_stats(uuid) from public, anon;
grant execute on function public.ministry_month_stats(uuid) to authenticated;
