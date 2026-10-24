-- Fase 14 — avisos programados de culto e ensaio
-- O líder define, por ministério e por tipo (culto/ensaio), quando avisar:
-- num dia da semana (ex.: segunda 9h), N dias antes (0 = no dia) ou N minutos
-- antes da chegada. Cada aviso leva a pessoa a confirmar presença ou avisar
-- atraso/falta (/confirmar/<culto>).

create table public.reminder_rules (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null,
  ministry_id    uuid not null,
  event_kind     public.event_kind not null check (event_kind in ('service', 'rehearsal')),
  timing         text not null check (timing in ('weekday', 'days_before', 'minutes_before')),
  weekday        smallint check (weekday between 0 and 6),
  days_before    smallint check (days_before between 0 and 7),
  at_time        time,
  minutes_before integer check (minutes_before between 5 and 1440),
  push_only      boolean not null default false, -- só no celular (sem WhatsApp)
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  check (
    (timing = 'weekday' and weekday is not null and at_time is not null)
    or (timing = 'days_before' and days_before is not null and at_time is not null)
    or (timing = 'minutes_before' and minutes_before is not null)
  )
);
create index reminder_rules_ministry_idx on public.reminder_rules (ministry_id);

alter table public.reminder_rules enable row level security;
create policy reminder_rules_select on public.reminder_rules
  for select to authenticated using (public.is_church_member(church_id));
create policy reminder_rules_insert on public.reminder_rules
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy reminder_rules_update on public.reminder_rules
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy reminder_rules_delete on public.reminder_rules
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- Padrão: ensaio na segunda 9h, no dia 9h e 1 h antes; culto no dia 9h e 1 h antes
create or replace function public.seed_reminder_rules(p_ministry_id uuid, p_church_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reminder_rules (church_id, ministry_id, event_kind, timing, weekday, days_before, at_time, minutes_before)
  values
    (p_church_id, p_ministry_id, 'rehearsal', 'weekday', 1, null, '09:00', null),
    (p_church_id, p_ministry_id, 'rehearsal', 'days_before', null, 0, '09:00', null),
    (p_church_id, p_ministry_id, 'rehearsal', 'minutes_before', null, null, null, 60),
    (p_church_id, p_ministry_id, 'service', 'days_before', null, 0, '09:00', null),
    (p_church_id, p_ministry_id, 'service', 'minutes_before', null, null, null, 60);
$$;
revoke execute on function public.seed_reminder_rules(uuid, uuid) from public, anon, authenticated;

select public.seed_reminder_rules(m.id, m.church_id) from public.ministries m;

create or replace function public.ministries_seed_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_reminder_rules(new.id, new.church_id);
  return new;
end;
$$;
create trigger ministries_seed_reminders after insert on public.ministries
  for each row execute function public.ministries_seed_reminders();

-- Quando a regra avisa sobre o evento (mesma conta de reminderFireAt em
-- _shared/domain/reminders.ts). null = cairia na hora da chegada ou depois.
create or replace function public.reminder_fire_at(
  p_timing         text,
  p_weekday        smallint,
  p_days_before    smallint,
  p_at_time        time,
  p_minutes_before integer,
  p_starts_at      timestamptz,
  p_arrive_at      timestamptz,
  p_tz             text
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_call timestamptz := coalesce(p_arrive_at, p_starts_at);
  v_day  date := (p_starts_at at time zone p_tz)::date;
  v_at   timestamptz;
begin
  if p_timing = 'minutes_before' then
    v_at := v_call - make_interval(mins => p_minutes_before);
  elsif p_timing = 'weekday' then
    v_at := ((v_day - ((extract(dow from v_day)::integer - p_weekday + 7) % 7)) + p_at_time) at time zone p_tz;
  else
    v_at := ((v_day - p_days_before) + p_at_time) at time zone p_tz;
  end if;
  return case when v_at < v_call then v_at end;
end;
$$;

-- "Só no celular": a regra pede pushOnly no aviso, então o WhatsApp não conta
create or replace function public.enqueue_notification(
  p_church_id  uuid,
  p_profile_id uuid,
  p_kind       public.notification_kind,
  p_dedupe_key text,
  p_payload    jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles%rowtype;
  v_status   public.notification_status := 'pending';
  v_error    text;
  v_whatsapp boolean;
  v_push     boolean;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then
    return;
  end if;
  v_whatsapp := not v_profile.whatsapp_opt_out and coalesce(v_profile.phone, '') <> ''
                and not coalesce((p_payload ->> 'pushOnly')::boolean, false);
  v_push := exists (select 1 from public.push_subscriptions where profile_id = p_profile_id);
  if not v_whatsapp and not v_push then
    v_status := 'skipped';
    v_error := case
      when coalesce((p_payload ->> 'pushOnly')::boolean, false) then 'Aviso só no celular e a pessoa não ativou avisos no celular'
      when v_profile.whatsapp_opt_out then 'Pessoa optou por não receber avisos no WhatsApp e não ativou avisos no celular'
      else 'Sem telefone cadastrado e sem avisos no celular'
    end;
  end if;

  insert into public.notification_queue (church_id, profile_id, kind, dedupe_key, payload, status, last_error)
  values (
    p_church_id, p_profile_id, p_kind, p_dedupe_key,
    p_payload || jsonb_build_object('name', v_profile.full_name),
    v_status, v_error
  )
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke execute on function public.enqueue_notification(uuid, uuid, public.notification_kind, text, jsonb)
  from public, anon, authenticated;

-- Lembretes pelas regras do ministério (substitui o D-2 e o "hoje tem ensaio").
-- Roda a cada 5 min; avisa o que venceu nas últimas 2 h. Quem ficou de fora,
-- recusou ou avisou falta não recebe. Duas regras na mesma hora viram um aviso.
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
    select sa.id as assignment_id, sa.status, e.id as event_id, e.church_id, e.kind, e.title,
           e.starts_at, e.arrive_at, e.soundcheck_at, e.service_event_id,
           s.title as service_title, s.starts_at as service_starts_at,
           mm.user_id, r.name as role_name, rr.timing, rr.push_only,
           public.reminder_fire_at(rr.timing, rr.weekday, rr.days_before, rr.at_time, rr.minutes_before,
                                   e.starts_at, e.arrive_at, coalesce(c.timezone, 'America/Sao_Paulo')) as fire_at
    from public.reminder_rules rr
    join public.events e on e.ministry_id = rr.ministry_id and e.kind = rr.event_kind
    join public.churches c on c.id = e.church_id
    join public.schedule_assignments sa on sa.event_id = e.id and sa.status in ('scheduled', 'confirmed')
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    left join public.ministry_roles r on r.id = sa.ministry_role_id
    left join public.events s on s.id = e.service_event_id
    where rr.enabled
      and e.starts_at > now()
      and e.starts_at < now() + interval '8 days'
      and not exists (
        select 1 from public.justifications j
        where j.event_id = e.id and j.ministry_member_id = sa.ministry_member_id
          and j.kind = 'absence' and j.status <> 'rejected'
      )
  loop
    continue when v_row.fire_at is null
               or v_row.fire_at > now()
               or v_row.fire_at < now() - interval '2 hours';
    perform public.enqueue_notification(
      v_row.church_id, v_row.user_id, 'event_reminder',
      'reminder:' || v_row.assignment_id || ':' || to_char(v_row.fire_at at time zone 'UTC', 'YYYYMMDDHH24'),
      jsonb_build_object(
        'kind', v_row.kind,
        'eventTitle', v_row.title,
        'eventStartsAt', v_row.starts_at,
        'arriveAt', v_row.arrive_at,
        'soundcheckAt', v_row.soundcheck_at,
        'role', v_row.role_name,
        'serviceTitle', v_row.service_title,
        'serviceStartsAt', v_row.service_starts_at,
        'confirmed', v_row.status = 'confirmed',
        'soon', v_row.timing = 'minutes_before',
        'pushOnly', v_row.push_only,
        'path', '/confirmar/' || coalesce(v_row.service_event_id, v_row.event_id)
      )
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

select cron.schedule('idex-lembretes', '*/5 * * * *', 'select public.enqueue_reminders()');

-- Confirmar presença: vale para o culto e o ensaio dele (o compromisso é com o culto).
-- Aceita o id do culto ou do ensaio. Devolve quantas escalas foram confirmadas.
create or replace function public.confirm_my_presence(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service uuid;
  v_count   integer;
begin
  select coalesce(e.service_event_id, e.id) into v_service
  from public.events e where e.id = p_event_id;
  if v_service is null then
    raise exception 'Evento não encontrado';
  end if;

  update public.schedule_assignments sa
  set status = 'confirmed'
  from public.events e, public.ministry_members mm
  where sa.event_id = e.id
    and (e.id = v_service or e.service_event_id = v_service)
    and mm.id = sa.ministry_member_id and mm.user_id = auth.uid()
    and sa.status = 'scheduled'
    and e.starts_at > now() - interval '6 hours';
  get diagnostics v_count = row_count;

  if v_count = 0 and not exists (
    select 1 from public.schedule_assignments sa
    join public.ministry_members mm on mm.id = sa.ministry_member_id
    where sa.event_id = v_service and mm.user_id = auth.uid()
  ) then
    raise exception 'Você não está na escala deste culto';
  end if;
  return v_count;
end;
$$;
revoke execute on function public.confirm_my_presence(uuid) from public, anon;
grant execute on function public.confirm_my_presence(uuid) to authenticated;
