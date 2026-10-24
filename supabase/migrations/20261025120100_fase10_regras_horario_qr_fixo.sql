-- =============================================================================
-- Fase 10 — regras de horário por tipo de evento e QR fixo do ministério
--
-- Culto: chegada X min antes, tolerância, passagem de som, e o que acontece
-- com quem passa da tolerância ("não toca neste culto").
-- Ensaio: X dias antes OU todo <dia da semana>, horário, chegada, tolerância
-- e consequência ("fora do ensaio" ou "fora do ensaio e do culto").
-- Quem fica de fora tem a escala marcada como 'benched' (o líder pode liberar).
-- QR fixo: um código por ministério; o ponto vai para o evento do integrante
-- que está com o ponto aberto agora.
-- =============================================================================

alter table public.ministry_settings
  add column rehearsal_mode             text    not null default 'days_before'
    check (rehearsal_mode in ('days_before', 'weekday')),
  add column rehearsal_weekday          integer check (rehearsal_weekday between 0 and 6),
  add column rehearsal_arrival_minutes  integer not null default 20 check (rehearsal_arrival_minutes between 0 and 240),
  add column service_tolerance_min      integer not null default 10 check (service_tolerance_min between 0 and 120),
  add column rehearsal_tolerance_min    integer not null default 10 check (rehearsal_tolerance_min between 0 and 120),
  add column service_soundcheck_minutes integer check (service_soundcheck_minutes between 0 and 360),
  add column service_late_consequence   text    not null default 'points'
    check (service_late_consequence in ('points', 'no_play')),
  add column rehearsal_late_consequence text    not null default 'points'
    check (rehearsal_late_consequence in ('points', 'out_rehearsal', 'out_rehearsal_and_service')),
  add column checkin_code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  add constraint rehearsal_weekday_required check (rehearsal_mode <> 'weekday' or rehearsal_weekday is not null);
grant update (
  rehearsal_mode, rehearsal_weekday, rehearsal_arrival_minutes, service_tolerance_min,
  rehearsal_tolerance_min, service_soundcheck_minutes, service_late_consequence, rehearsal_late_consequence
) on public.ministry_settings to authenticated;

-- Passagem de som do culto (entre a chegada e o início)
alter table public.events
  add column soundcheck_at timestamptz,
  add constraint events_soundcheck_window check (
    soundcheck_at is null or (soundcheck_at <= starts_at and soundcheck_at >= starts_at - interval '6 hours')
  );

alter table public.schedule_assignments add column benched_reason text;

-- Líder gera um código novo (o QR impresso antigo deixa de valer)
create or replace function public.regenerate_checkin_code(p_ministry_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  if not public.is_ministry_leader(p_ministry_id) then
    raise exception 'Só o líder do ministério' using errcode = '42501';
  end if;
  update public.ministry_settings set checkin_code = v_code where ministry_id = p_ministry_id;
  return v_code;
end;
$$;
revoke execute on function public.regenerate_checkin_code(uuid) from public, anon;
grant execute on function public.regenerate_checkin_code(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Consequência do atraso: tira (ou devolve) a pessoa da escala.
--   p_scope: 'none' (devolve se estava de fora), 'event', 'event_and_service'
-- -----------------------------------------------------------------------------
create or replace function public.apply_late_consequence(
  p_event_id           uuid,
  p_ministry_member_id uuid,
  p_scope              text,
  p_reason             text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   public.events%rowtype;
  v_targets uuid[];
  v_changed integer := 0;
  v_name    text;
  v_leader  record;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Evento não encontrado' using errcode = 'P0002';
  end if;
  v_targets := array[p_event_id] ||
    case when v_event.service_event_id is not null then array[v_event.service_event_id] else array[]::uuid[] end;

  if p_scope = 'none' then
    update public.schedule_assignments
    set status = 'scheduled', benched_reason = null
    where ministry_member_id = p_ministry_member_id and event_id = any (v_targets) and status = 'benched';
    return 0;
  end if;
  if p_scope not in ('event', 'event_and_service') then
    raise exception 'Escopo inválido' using errcode = '22023';
  end if;
  if p_scope = 'event' then
    v_targets := array[p_event_id];
  end if;

  with u as (
    update public.schedule_assignments
    set status = 'benched', benched_reason = left(p_reason, 200)
    where ministry_member_id = p_ministry_member_id and event_id = any (v_targets)
      and status in ('scheduled', 'confirmed')
    returning 1
  )
  select count(*) into v_changed from u;

  if v_changed > 0 then
    select p.full_name into v_name
    from public.ministry_members mm join public.profiles p on p.id = mm.user_id
    where mm.id = p_ministry_member_id;
    -- avisa a própria pessoa e os líderes (para chamar substituto)
    perform public.enqueue_notification(
      v_event.church_id, mm.user_id, 'member_benched',
      'benched:' || p_event_id || ':' || p_ministry_member_id || ':' || mm.user_id,
      jsonb_build_object('memberName', v_name, 'eventTitle', v_event.title, 'eventStartsAt', v_event.starts_at,
                         'scope', p_scope, 'reason', p_reason, 'self', true)
    )
    from public.ministry_members mm where mm.id = p_ministry_member_id;
    for v_leader in
      select mm.user_id from public.ministry_members mm
      where mm.ministry_id = v_event.ministry_id and mm.role = 'leader' and mm.status = 'active'
        and mm.id <> p_ministry_member_id
    loop
      perform public.enqueue_notification(
        v_event.church_id, v_leader.user_id, 'member_benched',
        'benched:' || p_event_id || ':' || p_ministry_member_id || ':' || v_leader.user_id,
        jsonb_build_object('memberName', v_name, 'eventTitle', v_event.title, 'eventStartsAt', v_event.starts_at,
                           'scope', p_scope, 'reason', p_reason, 'self', false)
      );
    end loop;
  end if;
  return v_changed;
end;
$$;
revoke execute on function public.apply_late_consequence(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_late_consequence(uuid, uuid, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Espelho culto → ensaio: mudar só o status (ex.: ficar de fora do culto)
-- não mexe no ensaio; recusar ('declined') tira do ensaio.
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
  if tg_op = 'UPDATE'
     and old.ministry_member_id = new.ministry_member_id
     and old.ministry_role_id is not distinct from new.ministry_role_id then
    if new.status = 'declined' and old.status <> 'declined' then
      select id into v_rehearsal from public.events where service_event_id = new.event_id;
      delete from public.schedule_assignments
      where event_id = v_rehearsal and ministry_member_id = new.ministry_member_id
        and ministry_role_id is not distinct from new.ministry_role_id;
    end if;
    return null;
  end if;
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
    if v_rehearsal is not null and new.status not in ('declined', 'benched') then
      insert into public.schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
      values (new.church_id, v_rehearsal, new.ministry_member_id, new.ministry_role_id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Faltas: quem ficou de fora (benched) não leva falta. E quem faltou ao
-- ensaio, com a regra "fora do ensaio e do culto", sai do culto logo que o
-- ensaio termina (sem esperar o prazo dos pedidos).
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

  for v_row in
    select r.id as rehearsal_id, sa.ministry_member_id
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
                      where q.event_id = r.id and q.ministry_member_id = sa.ministry_member_id
                        and q.status in ('pending', 'approved', 'adjusted'))
      and not exists (select 1 from public.justifications j
                      where j.event_id = r.id and j.ministry_member_id = sa.ministry_member_id
                        and j.status = 'approved')
  loop
    perform public.apply_late_consequence(v_row.rehearsal_id, v_row.ministry_member_id,
      'event_and_service', 'Faltou ao ensaio');
  end loop;

  return v_count;
end;
$$;

-- Lembretes: quem ficou de fora não recebe; inclui a passagem de som
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
    select sa.id as assignment_id, e.church_id, e.title, e.starts_at, e.arrive_at, e.soundcheck_at, e.kind, mm.user_id, r.name as role_name,
           (e.starts_at at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date as event_day,
           (now() at time zone coalesce(c.timezone, 'America/Sao_Paulo')) as local_now
    from public.schedule_assignments sa
    join public.events e on e.id = sa.event_id
    join public.churches c on c.id = e.church_id
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    left join public.ministry_roles r on r.id = sa.ministry_role_id
    where sa.status not in ('declined', 'benched')
      and e.starts_at > now()
      and e.starts_at < now() + interval '3 days'
  loop
    if v_row.event_day = (v_row.local_now)::date + 2 then
      perform public.enqueue_notification(
        v_row.church_id, v_row.user_id, 'schedule_reminder', 'schedule:' || v_row.assignment_id,
        jsonb_build_object('eventTitle', v_row.title, 'eventStartsAt', v_row.starts_at, 'arriveAt', v_row.arrive_at, 'soundcheckAt', v_row.soundcheck_at, 'role', v_row.role_name)
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
