-- =============================================================================
-- Fase 6 — Avisos por WhatsApp (Evolution API)
--
-- Fluxo: gatilhos e um job enfileiram em `notification_queue`; a Edge
-- Function `notifications-dispatch` (chamada pelo pg_cron a cada minuto)
-- pega a fila com `claim_notifications`, envia pela Evolution API e marca o
-- resultado com `finish_notification` (novas tentativas com espera crescente).
-- O texto é montado na função (regras em `_shared/domain/notifications.ts`).
-- =============================================================================

-- Preferência de cada pessoa
alter table public.profiles add column if not exists whatsapp_opt_out boolean not null default false;
grant update (whatsapp_opt_out) on public.profiles to authenticated;

create type public.notification_kind as enum ('schedule_reminder', 'rehearsal_today', 'points_deducted', 'request_reviewed');
create type public.notification_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

create table public.notification_queue (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  kind            public.notification_kind not null,
  dedupe_key      text not null unique,
  payload         jsonb not null default '{}',
  status          public.notification_status not null default 'pending',
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notification_queue_due_idx on public.notification_queue (next_attempt_at) where status = 'pending';
create index notification_queue_church_idx on public.notification_queue (church_id, created_at desc);
create index notification_queue_profile_idx on public.notification_queue (profile_id);

alter table public.notification_queue enable row level security;
-- a pessoa vê os próprios avisos; o dono da igreja vê os da igreja
create policy notification_queue_select on public.notification_queue
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_church_owner(church_id));
revoke insert, update, delete on public.notification_queue from authenticated;

-- -----------------------------------------------------------------------------
-- Enfileirar (não envia: só registra; quem não quer recebe "skipped")
-- -----------------------------------------------------------------------------
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
  v_profile public.profiles%rowtype;
  v_status  public.notification_status := 'pending';
  v_error   text;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then
    return;
  end if;
  if v_profile.whatsapp_opt_out then
    v_status := 'skipped';
    v_error := 'Pessoa optou por não receber avisos';
  elsif coalesce(v_profile.phone, '') = '' then
    v_status := 'skipped';
    v_error := 'Sem telefone cadastrado';
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

-- Ponto descontado
create or replace function public.notify_points_deducted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_event   public.events%rowtype;
  v_balance integer;
begin
  if new.delta >= 0 then
    return null;
  end if;
  select mm.user_id into v_profile from public.ministry_members mm where mm.id = new.ministry_member_id;
  if new.event_id is not null then
    select * into v_event from public.events where id = new.event_id;
  end if;
  select coalesce(sum(delta), 0)::integer into v_balance
  from public.point_ledger where cycle_id = new.cycle_id and ministry_member_id = new.ministry_member_id;

  perform public.enqueue_notification(
    new.church_id, v_profile, 'points_deducted', 'ledger:' || new.id,
    jsonb_build_object(
      'delta', new.delta, 'reason', new.reason, 'balance', v_balance,
      'eventTitle', v_event.title, 'eventStartsAt', v_event.starts_at
    )
  );
  return null;
end;
$$;

create trigger point_ledger_notify
  after insert on public.point_ledger
  for each row execute function public.notify_points_deducted();

-- Pedido "esqueci de registrar" analisado
create or replace function public.notify_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_title   text;
begin
  if old.status <> 'pending' or new.status = 'pending' then
    return null;
  end if;
  select mm.user_id into v_profile from public.ministry_members mm where mm.id = new.ministry_member_id;
  select e.title into v_title from public.events e where e.id = new.event_id;
  perform public.enqueue_notification(
    new.church_id, v_profile, 'request_reviewed', tg_table_name || ':' || new.id,
    jsonb_build_object(
      'status', new.status, 'eventTitle', v_title,
      'kind', case when tg_table_name = 'justifications' then 'justificativa' else 'pedido' end
    )
  );
  return null;
end;
$$;

create trigger checkin_requests_notify
  after update of status on public.checkin_requests
  for each row execute function public.notify_request_reviewed();
create trigger justifications_notify
  after update of status on public.justifications
  for each row execute function public.notify_request_reviewed();

-- Lembretes: escala D-2 e ensaio no dia (a partir das 8h). Idempotente.
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
    select sa.id as assignment_id, e.church_id, e.title, e.starts_at, e.kind, mm.user_id, r.name as role_name,
           (e.starts_at at time zone coalesce(c.timezone, 'America/Sao_Paulo'))::date as event_day,
           (now() at time zone coalesce(c.timezone, 'America/Sao_Paulo')) as local_now
    from public.schedule_assignments sa
    join public.events e on e.id = sa.event_id
    join public.churches c on c.id = e.church_id
    join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
    left join public.ministry_roles r on r.id = sa.ministry_role_id
    where sa.status <> 'declined'
      and e.starts_at > now()
      and e.starts_at < now() + interval '3 days'
  loop
    if v_row.event_day = (v_row.local_now)::date + 2 then
      perform public.enqueue_notification(
        v_row.church_id, v_row.user_id, 'schedule_reminder', 'schedule:' || v_row.assignment_id,
        jsonb_build_object('eventTitle', v_row.title, 'eventStartsAt', v_row.starts_at, 'role', v_row.role_name)
      );
      v_count := v_count + 1;
    elsif v_row.kind = 'rehearsal' and v_row.event_day = (v_row.local_now)::date
          and extract(hour from v_row.local_now) >= 8 then
      perform public.enqueue_notification(
        v_row.church_id, v_row.user_id, 'rehearsal_today', 'rehearsal:' || v_row.assignment_id,
        jsonb_build_object('eventTitle', v_row.title, 'eventStartsAt', v_row.starts_at)
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Usadas pela Edge Function de envio (service_role)
-- -----------------------------------------------------------------------------
create or replace function public.claim_notifications(p_limit integer default 50)
returns table (id uuid, kind public.notification_kind, payload jsonb, attempts integer, phone text)
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select q.id
    from public.notification_queue q
    where q.status = 'pending' and q.next_attempt_at <= now()
    order by q.next_attempt_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  update public.notification_queue q
  set status = 'sending', attempts = q.attempts + 1
  from picked, public.profiles p
  where q.id = picked.id and p.id = q.profile_id
  returning q.id, q.kind, q.payload, q.attempts, p.phone;
$$;

create or replace function public.finish_notification(
  p_id         uuid,
  p_ok         boolean,
  p_error      text default null,
  p_retry_at   timestamptz default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_queue
  set status = case when p_ok then 'sent'::public.notification_status
                    when p_retry_at is not null then 'pending'
                    else 'failed' end,
      sent_at = case when p_ok then now() end,
      last_error = case when p_ok then null else left(p_error, 500) end,
      next_attempt_at = coalesce(p_retry_at, next_attempt_at)
  where id = p_id;
$$;

-- Envio travado em "sending" por mais de 10 min (função caiu) volta para a fila
create or replace function public.requeue_stuck_notifications()
returns integer
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.notification_queue
    set status = 'pending', next_attempt_at = now()
    where status = 'sending' and next_attempt_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::integer from u;
$$;

revoke execute on function
  public.enqueue_notification(uuid, uuid, public.notification_kind, text, jsonb),
  public.notify_points_deducted(),
  public.notify_request_reviewed(),
  public.enqueue_reminders(),
  public.claim_notifications(integer),
  public.finish_notification(uuid, boolean, text, timestamptz),
  public.requeue_stuck_notifications()
from public, anon, authenticated;
grant execute on function
  public.enqueue_reminders(),
  public.claim_notifications(integer),
  public.finish_notification(uuid, boolean, text, timestamptz),
  public.requeue_stuck_notifications()
to service_role;

-- -----------------------------------------------------------------------------
-- Agendamento
-- Lembretes a cada 15 min. O envio chama a Edge Function pelo pg_net a cada
-- minuto, usando dois segredos do Vault (Project Settings → Vault):
--   project_url       ex.: https://abcd.supabase.co
--   service_role_key  a chave service_role do projeto
-- Sem eles, o job não faz nada (a fila só acumula).
-- -----------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_notifications_http()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  perform public.requeue_stuck_notifications();
  if not exists (select 1 from public.notification_queue where status = 'pending' and next_attempt_at <= now()) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/notifications-dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.dispatch_notifications_http() from public, anon, authenticated;

select cron.schedule('idex-lembretes', '*/15 * * * *', 'select public.enqueue_reminders()');
select cron.schedule('idex-enviar-avisos', '* * * * *', 'select public.dispatch_notifications_http()');
