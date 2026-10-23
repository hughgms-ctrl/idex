-- =============================================================================
-- ide.x — schema completo do MVP (todas as fases)
--
-- Convenções:
--   * Toda tabela de negócio tem church_id (multi-tenant). As FKs para tabelas
--     "pai" são compostas (id, church_id), o que garante no próprio banco que
--     um registro nunca aponta para dado de outra igreja.
--   * Datas/horas em timestamptz (UTC). Exibição em America/Sao_Paulo.
--   * RLS e policies ficam na migration seguinte (..._rls.sql).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.church_role as enum ('owner', 'member');
create type public.ministry_member_role as enum ('leader', 'member');
create type public.member_status as enum ('active', 'inactive');
create type public.event_kind as enum ('service', 'rehearsal', 'other');
create type public.assignment_status as enum ('scheduled', 'confirmed', 'declined');
create type public.cycle_status as enum ('open', 'closed');
create type public.checkin_source as enum ('qr', 'request', 'manual');
create type public.request_status as enum ('pending', 'approved', 'adjusted', 'rejected');
create type public.justification_status as enum ('pending', 'approved', 'rejected');
create type public.justification_kind as enum ('late', 'absence');
create type public.point_reason as enum (
  'cycle_start',      -- crédito inicial do ciclo (inclui quem entra no meio)
  'late',             -- atraso além da tolerância
  'absence',          -- falta sem aviso
  'request_rejected', -- pedido "esqueci de registrar" recusado (vira falta)
  'adjustment'        -- ajuste manual do líder (sempre com nota)
);

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Igreja, perfis e vínculos
-- -----------------------------------------------------------------------------
create table public.churches (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) between 2 and 120),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone         text not null default 'America/Sao_Paulo',
  address          text,
  lat              double precision check (lat between -90 and 90),
  lng              double precision check (lng between -180 and 180),
  checkin_radius_m integer not null default 300 check (checkin_radius_m between 10 and 5000),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Perfil do usuário (1:1 com auth.users). Não tem church_id porque a mesma
-- pessoa pode participar de mais de uma igreja; a visibilidade é controlada
-- por RLS (só quem divide uma igreja com você vê seu perfil).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '' check (length(full_name) <= 120),
  phone      text check (phone is null or phone ~ '^\+?[0-9 ()-]{8,20}$'),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.church_members (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.church_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (church_id, user_id)
);
create index church_members_user_idx on public.church_members (user_id);

-- -----------------------------------------------------------------------------
-- Ministérios
-- -----------------------------------------------------------------------------
create table public.ministries (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references public.churches (id) on delete cascade,
  name        text not null check (length(trim(name)) between 2 and 80),
  kind        text not null default 'worship', -- worship, media, kids, reception...
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (church_id, name),
  unique (id, church_id)
);

create table public.ministry_settings (
  ministry_id                     uuid primary key,
  church_id                       uuid not null,
  cycle_months                    integer not null default 3 check (cycle_months between 1 and 12),
  cycle_starting_points           integer not null default 100 check (cycle_starting_points > 0),
  cycle_min_points                integer not null default 70 check (cycle_min_points >= 0),
  late_tolerance_min              integer not null default 10 check (late_tolerance_min >= 0),
  -- Faixas de desconto por atraso (minutos APÓS a tolerância). A última faixa
  -- usa "upToMin": null = sem limite superior.
  late_penalty_tiers              jsonb not null default '[{"upToMin": 20, "points": 5}, {"upToMin": null, "points": 10}]',
  absence_penalty                 integer not null default 20 check (absence_penalty >= 0),
  checkin_request_limit_per_cycle integer not null default 3 check (checkin_request_limit_per_cycle >= 0),
  checkin_request_deadline_hours  integer not null default 48 check (checkin_request_deadline_hours > 0),
  checkin_radius_m                integer check (checkin_radius_m between 10 and 5000), -- null = usa o da igreja
  updated_at                      timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  check (jsonb_typeof(late_penalty_tiers) = 'array'),
  check (cycle_min_points <= cycle_starting_points)
);

-- Funções do ministério (ministro, vocal, violão...)
create table public.ministry_roles (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  ministry_id uuid not null,
  name        text not null check (length(trim(name)) between 1 and 60),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (ministry_id, name),
  unique (id, church_id)
);
create index ministry_roles_church_idx on public.ministry_roles (church_id);

create table public.ministry_members (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  ministry_id uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.ministry_member_role not null default 'member',
  status      public.member_status not null default 'active',
  joined_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  -- só quem já é da igreja pode entrar num ministério dela
  foreign key (church_id, user_id) references public.church_members (church_id, user_id) on delete cascade,
  unique (ministry_id, user_id),
  unique (id, church_id)
);
create index ministry_members_church_idx on public.ministry_members (church_id);
create index ministry_members_user_idx on public.ministry_members (user_id);

-- Um membro pode ter várias funções
create table public.ministry_member_roles (
  church_id          uuid not null,
  ministry_member_id uuid not null,
  ministry_role_id   uuid not null,
  created_at         timestamptz not null default now(),
  primary key (ministry_member_id, ministry_role_id),
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  foreign key (ministry_role_id, church_id) references public.ministry_roles (id, church_id) on delete cascade
);
create index ministry_member_roles_church_idx on public.ministry_member_roles (church_id);
create index ministry_member_roles_role_idx on public.ministry_member_roles (ministry_role_id);

create table public.member_unavailability (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  ministry_member_id uuid not null,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  recurrence_rule    text, -- RRULE (RFC 5545), ex.: FREQ=WEEKLY;BYDAY=WE
  reason             text,
  created_at         timestamptz not null default now(),
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  check (ends_at > starts_at)
);
create index member_unavailability_member_idx on public.member_unavailability (ministry_member_id, starts_at);
create index member_unavailability_church_idx on public.member_unavailability (church_id);

-- -----------------------------------------------------------------------------
-- Eventos e escala
-- -----------------------------------------------------------------------------
create table public.events (
  id                   uuid primary key default gen_random_uuid(),
  church_id            uuid not null,
  ministry_id          uuid not null,
  kind                 public.event_kind not null default 'service',
  title                text not null check (length(trim(title)) between 1 and 120),
  starts_at            timestamptz not null,
  ends_at              timestamptz,
  recurrence_rule      text,                 -- RRULE do evento "modelo"
  recurrence_parent_id uuid references public.events (id) on delete set null,
  location_name        text,
  lat                  double precision check (lat between -90 and 90),
  lng                  double precision check (lng between -180 and 180),
  radius_m             integer check (radius_m between 10 and 5000), -- null = usa o do ministério/igreja
  notes                text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (id, church_id),
  check (ends_at is null or ends_at > starts_at)
);
create index events_ministry_starts_idx on public.events (ministry_id, starts_at);
create index events_church_starts_idx on public.events (church_id, starts_at);
create index events_parent_idx on public.events (recurrence_parent_id);

create table public.schedule_assignments (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  event_id           uuid not null,
  ministry_member_id uuid not null,
  ministry_role_id   uuid,
  status             public.assignment_status not null default 'scheduled',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  foreign key (ministry_role_id, church_id) references public.ministry_roles (id, church_id) on delete set null (ministry_role_id),
  unique nulls not distinct (event_id, ministry_member_id, ministry_role_id)
);
create index schedule_assignments_member_idx on public.schedule_assignments (ministry_member_id);
create index schedule_assignments_church_idx on public.schedule_assignments (church_id);

-- -----------------------------------------------------------------------------
-- Repertório
-- -----------------------------------------------------------------------------
create table public.songs (
  id             uuid primary key default gen_random_uuid(),
  church_id      uuid not null,
  ministry_id    uuid not null,
  title          text not null check (length(trim(title)) between 1 and 160),
  artist         text,
  chordpro       text not null default '',
  original_key   text check (original_key is null or original_key ~ '^[A-G](#|b)?m?$'),
  bpm            integer check (bpm between 20 and 300),
  time_signature text check (time_signature is null or time_signature ~ '^[0-9]{1,2}/[0-9]{1,2}$'),
  links          jsonb not null default '[]' check (jsonb_typeof(links) = 'array'), -- [{label, url}]
  tags           text[] not null default '{}',
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (id, church_id)
);
create index songs_ministry_title_idx on public.songs (ministry_id, lower(title));
create index songs_church_idx on public.songs (church_id);

create table public.setlists (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  event_id    uuid not null unique,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  unique (id, church_id)
);
create index setlists_church_idx on public.setlists (church_id);

create table public.setlist_items (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  setlist_id  uuid not null,
  song_id     uuid not null,
  position    integer not null check (position >= 0),
  key         text check (key is null or key ~ '^[A-G](#|b)?m?$'), -- tom escolhido pelo ministro
  notes       text,
  created_at  timestamptz not null default now(),
  foreign key (setlist_id, church_id) references public.setlists (id, church_id) on delete cascade,
  foreign key (song_id, church_id) references public.songs (id, church_id) on delete cascade
);
create index setlist_items_setlist_idx on public.setlist_items (setlist_id, position);
create index setlist_items_song_idx on public.setlist_items (song_id);
create index setlist_items_church_idx on public.setlist_items (church_id);

-- -----------------------------------------------------------------------------
-- Ciclos, presença e pontos
-- -----------------------------------------------------------------------------
create table public.cycles (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  ministry_id uuid not null,
  starts_on   date not null,
  ends_on     date not null,
  status      public.cycle_status not null default 'open',
  closed_at   timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (ministry_id, starts_on),
  unique (id, church_id),
  check (ends_on > starts_on)
);
create index cycles_church_idx on public.cycles (church_id);
-- No máximo um ciclo aberto por ministério
create unique index cycles_one_open_per_ministry on public.cycles (ministry_id) where status = 'open';

create table public.checkins (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  event_id           uuid not null,
  ministry_member_id uuid not null,
  arrived_at         timestamptz not null,
  lat                double precision,
  lng                double precision,
  accuracy_m         double precision,
  distance_m         double precision,
  late_minutes       integer not null default 0 check (late_minutes >= 0),
  source             public.checkin_source not null default 'qr',
  created_at         timestamptz not null default now(),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  unique (event_id, ministry_member_id),
  unique (id, church_id)
);
create index checkins_member_idx on public.checkins (ministry_member_id);
create index checkins_church_idx on public.checkins (church_id);

-- "Esqueci de registrar"
create table public.checkin_requests (
  id                  uuid primary key default gen_random_uuid(),
  church_id           uuid not null,
  event_id            uuid not null,
  ministry_member_id  uuid not null,
  declared_arrived_at timestamptz not null,
  reason              text not null check (length(trim(reason)) between 3 and 500),
  status              public.request_status not null default 'pending',
  adjusted_arrived_at timestamptz,
  evidence            jsonb not null default '{}', -- ex.: localização registrada pelo app
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  unique (event_id, ministry_member_id),
  unique (id, church_id),
  check (status <> 'adjusted' or adjusted_arrived_at is not null)
);
create index checkin_requests_member_idx on public.checkin_requests (ministry_member_id);
create index checkin_requests_church_status_idx on public.checkin_requests (church_id, status);

-- Justificativa de falta/atraso enviada ANTES do evento
create table public.justifications (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  event_id           uuid not null,
  ministry_member_id uuid not null,
  kind               public.justification_kind not null,
  reason             text not null check (length(trim(reason)) between 3 and 500),
  status             public.justification_status not null default 'pending',
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  review_note        text,
  created_at         timestamptz not null default now(),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  unique (event_id, ministry_member_id)
);
create index justifications_member_idx on public.justifications (ministry_member_id);
create index justifications_church_status_idx on public.justifications (church_id, status);

-- Livro-razão de pontos: única fonte do saldo. Só recebe INSERT (nunca UPDATE/DELETE).
create table public.point_ledger (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  ministry_id        uuid not null,
  cycle_id           uuid not null,
  ministry_member_id uuid not null,
  delta              integer not null check (delta <> 0),
  reason             public.point_reason not null,
  event_id           uuid,
  checkin_id         uuid,
  checkin_request_id uuid,
  note               text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  foreign key (cycle_id, church_id) references public.cycles (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  foreign key (event_id, church_id) references public.events (id, church_id) on delete set null (event_id),
  foreign key (checkin_id, church_id) references public.checkins (id, church_id) on delete set null (checkin_id),
  foreign key (checkin_request_id, church_id) references public.checkin_requests (id, church_id) on delete set null (checkin_request_id),
  check (reason <> 'adjustment' or note is not null)
);
create index point_ledger_cycle_member_idx on public.point_ledger (cycle_id, ministry_member_id);
create index point_ledger_church_idx on public.point_ledger (church_id);
create index point_ledger_member_idx on public.point_ledger (ministry_member_id);
create index point_ledger_event_idx on public.point_ledger (event_id);

create or replace function public.point_ledger_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Única exceção: apagar em cascata quando o membro, o ciclo ou o ministério
  -- (ou a igreja inteira) deixou de existir.
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.ministry_members mm where mm.id = old.ministry_member_id)
    or not exists (select 1 from public.cycles c where c.id = old.cycle_id)
    or not exists (select 1 from public.ministries m where m.id = old.ministry_id)
  ) then
    return old;
  end if;
  raise exception 'point_ledger é somente inserção: lance um ajuste em vez de alterar ou apagar';
end;
$$;

create trigger point_ledger_no_update
  before update on public.point_ledger
  for each row execute function public.point_ledger_block_changes();
create trigger point_ledger_no_delete
  before delete on public.point_ledger
  for each row execute function public.point_ledger_block_changes();

-- Resultado do fechamento de um ciclo: quem pode ser escalado no PRÓXIMO ciclo.
create table public.cycle_eligibility (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null,
  ministry_id        uuid not null,
  cycle_id           uuid not null, -- ciclo fechado que gerou o resultado
  ministry_member_id uuid not null,
  balance            integer not null,
  eligible           boolean not null,
  computed_at        timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  foreign key (cycle_id, church_id) references public.cycles (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade,
  unique (cycle_id, ministry_member_id)
);
create index cycle_eligibility_church_idx on public.cycle_eligibility (church_id);
create index cycle_eligibility_member_idx on public.cycle_eligibility (ministry_member_id);

-- Saldo do membro por ciclo = soma do ledger. security_invoker: respeita a RLS
-- de quem consulta.
create view public.member_cycle_balance
with (security_invoker = true)
as
select
  pl.church_id,
  pl.ministry_id,
  pl.cycle_id,
  pl.ministry_member_id,
  sum(pl.delta)::integer as balance,
  count(*) filter (where pl.delta < 0)::integer as penalties,
  max(pl.created_at) as last_entry_at
from public.point_ledger pl
group by pl.church_id, pl.ministry_id, pl.cycle_id, pl.ministry_member_id;

-- -----------------------------------------------------------------------------
-- Planejamento trimestral
-- -----------------------------------------------------------------------------
create table public.quarter_plan_rules (
  ministry_id                uuid primary key,
  church_id                  uuid not null,
  min_weeks_between_repeats  integer not null default 4 check (min_weeks_between_repeats >= 0),
  max_new_songs_per_month    integer not null default 2 check (max_new_songs_per_month >= 0),
  songs_per_service          integer not null default 5 check (songs_per_service between 1 and 20),
  updated_at                 timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------
create table public.invites (
  id                uuid primary key default gen_random_uuid(),
  church_id         uuid not null,
  ministry_id       uuid not null,
  token             text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  email             text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role              public.ministry_member_role not null default 'member',
  ministry_role_ids uuid[] not null default '{}',
  max_uses          integer not null default 1 check (max_uses between 1 and 500),
  uses_count        integer not null default 0 check (uses_count >= 0),
  expires_at        timestamptz not null default now() + interval '7 days',
  revoked_at        timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  check (uses_count <= max_uses)
);
create index invites_church_idx on public.invites (church_id);
create index invites_ministry_idx on public.invites (ministry_id);

-- -----------------------------------------------------------------------------
-- Auditoria (escrita apenas por triggers security definer)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  church_id  uuid not null references public.churches (id) on delete cascade,
  actor_id   uuid,
  action     text not null,
  table_name text not null,
  record_id  text,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_church_created_idx on public.audit_log (church_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create trigger churches_updated_at before update on public.churches
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger ministries_updated_at before update on public.ministries
  for each row execute function public.set_updated_at();
create trigger ministry_settings_updated_at before update on public.ministry_settings
  for each row execute function public.set_updated_at();
create trigger ministry_members_updated_at before update on public.ministry_members
  for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger schedule_assignments_updated_at before update on public.schedule_assignments
  for each row execute function public.set_updated_at();
create trigger songs_updated_at before update on public.songs
  for each row execute function public.set_updated_at();
create trigger setlists_updated_at before update on public.setlists
  for each row execute function public.set_updated_at();
create trigger quarter_plan_rules_updated_at before update on public.quarter_plan_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Perfil criado automaticamente no cadastro do usuário
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
