-- =============================================================================
-- Fase 7 — funções escolhidas pelo membro, disponibilidade por culto,
-- modo do ponto (QR / QR + localização / só localização) e Web Push.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções (instrumentos/voz): o próprio membro também escolhe as suas
-- -----------------------------------------------------------------------------
drop policy ministry_member_roles_insert on public.ministry_member_roles;
create policy ministry_member_roles_insert on public.ministry_member_roles
  for insert to authenticated
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
drop policy ministry_member_roles_delete on public.ministry_member_roles;
create policy ministry_member_roles_delete on public.ministry_member_roles
  for delete to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- A função tem que ser do mesmo ministério do membro
create or replace function public.member_role_same_ministry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.ministry_members mm
    join public.ministry_roles r on r.ministry_id = mm.ministry_id
    where mm.id = new.ministry_member_id and r.id = new.ministry_role_id
  ) then
    raise exception 'A função não é do ministério deste integrante' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.member_role_same_ministry() from public, anon, authenticated;

create trigger ministry_member_roles_same_ministry
  before insert or update on public.ministry_member_roles
  for each row execute function public.member_role_same_ministry();

-- -----------------------------------------------------------------------------
-- Disponibilidade por evento: o membro diz se pode (true) ou não (false).
-- Sem resposta = pode ser escalado normalmente.
-- -----------------------------------------------------------------------------
create table public.event_availability (
  church_id          uuid not null,
  event_id           uuid not null,
  ministry_member_id uuid not null,
  available          boolean not null,
  note               text check (note is null or length(note) <= 200),
  updated_at         timestamptz not null default now(),
  primary key (event_id, ministry_member_id),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade
);
create index event_availability_member_idx on public.event_availability (ministry_member_id);
create index event_availability_church_idx on public.event_availability (church_id);

alter table public.event_availability enable row level security;
-- o próprio membro e o líder dele
create policy event_availability_select on public.event_availability
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy event_availability_insert on public.event_availability
  for insert to authenticated
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy event_availability_update on public.event_availability
  for update to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id))
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy event_availability_delete on public.event_availability
  for delete to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

create or replace function public.event_availability_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.ministry_members mm on mm.ministry_id = e.ministry_id
    where e.id = new.event_id and mm.id = new.ministry_member_id
  ) then
    raise exception 'O integrante não é do ministério deste evento' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.event_availability_guard() from public, anon, authenticated;

create trigger event_availability_guard
  before insert or update on public.event_availability
  for each row execute function public.event_availability_guard();

-- Período da programação que a equipe responde (o líder escolhe em
-- Configurações). Sem período aberto, o membro não vê datas para responder.
alter table public.ministry_settings
  add column availability_starts_on date,
  add column availability_ends_on   date,
  add column availability_deadline  date,
  add constraint availability_period_ok check (
    (availability_starts_on is null) = (availability_ends_on is null)
    and (availability_ends_on is null or availability_ends_on >= availability_starts_on)
    and (availability_ends_on is null or availability_ends_on <= availability_starts_on + 366)
  );
grant update (availability_starts_on, availability_ends_on, availability_deadline)
  on public.ministry_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Modo do ponto, escolhido pelo líder:
--   qr      só o QR (localização não é exigida)
--   qr_geo  QR e localização (padrão)
--   geo     só a localização, pelo app, sem QR
-- -----------------------------------------------------------------------------
alter table public.ministry_settings
  add column checkin_mode text not null default 'qr_geo'
  check (checkin_mode in ('qr', 'qr_geo', 'geo'));
grant update (checkin_mode) on public.ministry_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Web Push: aparelhos de cada pessoa
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint        text not null unique check (endpoint like 'https://%'),
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));
-- gravação só pelas funções abaixo (o mesmo aparelho pode trocar de conta)
revoke insert, update, delete on public.push_subscriptions from authenticated, anon;

create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and profile_id = (select auth.uid());
$$;

revoke execute on function public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Fila de avisos: agora com dois canais (WhatsApp e push no celular).
-- Fica "skipped" só quando a pessoa não tem nenhum canal.
-- -----------------------------------------------------------------------------
alter table public.notification_queue add column push_sent_at timestamptz;

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
  v_whatsapp := not v_profile.whatsapp_opt_out and coalesce(v_profile.phone, '') <> '';
  v_push := exists (select 1 from public.push_subscriptions where profile_id = p_profile_id);
  if not v_whatsapp and not v_push then
    v_status := 'skipped';
    v_error := case
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

-- O envio recebe os canais de cada aviso
drop function public.claim_notifications(integer);
create function public.claim_notifications(p_limit integer default 50)
returns table (
  id         uuid,
  kind       public.notification_kind,
  payload    jsonb,
  attempts   integer,
  profile_id uuid,
  phone      text,
  push_sent  boolean
)
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
  returning q.id, q.kind, q.payload, q.attempts, q.profile_id,
            case when p.whatsapp_opt_out then null else nullif(p.phone, '') end,
            q.push_sent_at is not null;
$$;
revoke execute on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
