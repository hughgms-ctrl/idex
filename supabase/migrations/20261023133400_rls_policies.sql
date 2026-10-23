-- =============================================================================
-- ide.x — RLS, policies e permissões
--
-- Regras:
--   * RLS ativada em TODAS as tabelas, todas com policy.
--   * Policies usam funções security definer (evitam recursão de RLS e ficam
--     legíveis): is_church_member, is_church_owner, is_ministry_leader...
--   * O cliente NUNCA escreve em point_ledger, checkins, checkin_requests,
--     cycles, cycle_eligibility e audit_log: essas tabelas não têm policy de
--     escrita e os privilégios de INSERT/UPDATE/DELETE são revogados. Elas são
--     escritas só por funções security definer (RPC/Edge Function).
--   * O papel "anon" (não logado) não lê nenhuma tabela.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções auxiliares (security definer, search_path vazio)
-- -----------------------------------------------------------------------------
create or replace function public.is_church_member(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_members cm
    where cm.church_id = p_church_id and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_church_owner(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.church_members cm
    where cm.church_id = p_church_id
      and cm.user_id = (select auth.uid())
      and cm.role = 'owner'
  );
$$;

-- Líder do ministério ou dono da igreja do ministério
create or replace function public.is_ministry_leader(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = p_ministry_id
      and mm.user_id = (select auth.uid())
      and mm.role = 'leader'
      and mm.status = 'active'
  ) or exists (
    select 1
    from public.ministries m
    join public.church_members cm on cm.church_id = m.church_id
    where m.id = p_ministry_id
      and cm.user_id = (select auth.uid())
      and cm.role = 'owner'
  );
$$;

create or replace function public.is_ministry_member(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = p_ministry_id and mm.user_id = (select auth.uid())
  );
$$;

-- O registro de ministry_members pertence ao usuário logado?
create or replace function public.is_self_member(p_ministry_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ministry_members mm
    where mm.id = p_ministry_member_id and mm.user_id = (select auth.uid())
  );
$$;

-- O usuário logado lidera o ministério desse membro?
create or replace function public.is_leader_of_member(p_ministry_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ministry_members mm
    where mm.id = p_ministry_member_id
      and public.is_ministry_leader(mm.ministry_id)
  );
$$;

create or replace function public.is_event_leader(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and public.is_ministry_leader(e.ministry_id)
  );
$$;

create or replace function public.is_setlist_leader(p_setlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.setlists s
    where s.id = p_setlist_id and public.is_event_leader(s.event_id)
  );
$$;

-- Dois usuários dividem alguma igreja? (para enxergar o perfil do outro)
create or replace function public.shares_church_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.church_members a
    join public.church_members b on b.church_id = a.church_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user_id
  );
$$;

-- Membro pode enviar justificativa para o evento: é do mesmo ministério e o
-- evento ainda não começou.
create or replace function public.can_justify_event(p_ministry_member_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ministry_members mm
    join public.events e on e.ministry_id = mm.ministry_id
    where mm.id = p_ministry_member_id
      and mm.user_id = (select auth.uid())
      and e.id = p_event_id
      and e.starts_at > now()
  );
$$;

-- -----------------------------------------------------------------------------
-- Ativar RLS em todas as tabelas
-- -----------------------------------------------------------------------------
alter table public.churches              enable row level security;
alter table public.profiles              enable row level security;
alter table public.church_members        enable row level security;
alter table public.ministries            enable row level security;
alter table public.ministry_settings     enable row level security;
alter table public.ministry_roles        enable row level security;
alter table public.ministry_members      enable row level security;
alter table public.ministry_member_roles enable row level security;
alter table public.member_unavailability enable row level security;
alter table public.events                enable row level security;
alter table public.schedule_assignments  enable row level security;
alter table public.songs                 enable row level security;
alter table public.setlists              enable row level security;
alter table public.setlist_items         enable row level security;
alter table public.cycles                enable row level security;
alter table public.checkins              enable row level security;
alter table public.checkin_requests      enable row level security;
alter table public.justifications        enable row level security;
alter table public.point_ledger          enable row level security;
alter table public.cycle_eligibility     enable row level security;
alter table public.quarter_plan_rules    enable row level security;
alter table public.invites               enable row level security;
alter table public.audit_log             enable row level security;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

-- churches: criação só pela RPC create_church
create policy churches_select on public.churches
  for select to authenticated using (public.is_church_member(id));
create policy churches_update on public.churches
  for update to authenticated
  using (public.is_church_owner(id)) with check (public.is_church_owner(id));

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_church_with(id));
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- church_members: entrada só por create_church/accept_invite
create policy church_members_select on public.church_members
  for select to authenticated using (public.is_church_member(church_id));
create policy church_members_update on public.church_members
  for update to authenticated
  using (public.is_church_owner(church_id)) with check (public.is_church_owner(church_id));
create policy church_members_delete on public.church_members
  for delete to authenticated
  using (public.is_church_owner(church_id) and user_id <> (select auth.uid()));

-- ministries
create policy ministries_select on public.ministries
  for select to authenticated using (public.is_church_member(church_id));
create policy ministries_insert on public.ministries
  for insert to authenticated with check (public.is_church_owner(church_id));
create policy ministries_update on public.ministries
  for update to authenticated
  using (public.is_ministry_leader(id)) with check (public.is_ministry_leader(id));
create policy ministries_delete on public.ministries
  for delete to authenticated using (public.is_church_owner(church_id));

-- ministry_settings: criadas por gatilho; líder ajusta
create policy ministry_settings_select on public.ministry_settings
  for select to authenticated using (public.is_church_member(church_id));
create policy ministry_settings_update on public.ministry_settings
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));

-- ministry_roles
create policy ministry_roles_select on public.ministry_roles
  for select to authenticated using (public.is_church_member(church_id));
create policy ministry_roles_insert on public.ministry_roles
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy ministry_roles_update on public.ministry_roles
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy ministry_roles_delete on public.ministry_roles
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- ministry_members
create policy ministry_members_select on public.ministry_members
  for select to authenticated using (public.is_church_member(church_id));
create policy ministry_members_insert on public.ministry_members
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy ministry_members_update on public.ministry_members
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy ministry_members_delete on public.ministry_members
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- ministry_member_roles
create policy ministry_member_roles_select on public.ministry_member_roles
  for select to authenticated using (public.is_church_member(church_id));
create policy ministry_member_roles_insert on public.ministry_member_roles
  for insert to authenticated with check (public.is_leader_of_member(ministry_member_id));
create policy ministry_member_roles_delete on public.ministry_member_roles
  for delete to authenticated using (public.is_leader_of_member(ministry_member_id));

-- member_unavailability: o próprio membro ou o líder
create policy member_unavailability_select on public.member_unavailability
  for select to authenticated using (public.is_church_member(church_id));
create policy member_unavailability_insert on public.member_unavailability
  for insert to authenticated
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy member_unavailability_update on public.member_unavailability
  for update to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id))
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy member_unavailability_delete on public.member_unavailability
  for delete to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- events
create policy events_select on public.events
  for select to authenticated using (public.is_church_member(church_id));
create policy events_insert on public.events
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy events_update on public.events
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy events_delete on public.events
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- schedule_assignments
create policy schedule_assignments_select on public.schedule_assignments
  for select to authenticated using (public.is_church_member(church_id));
create policy schedule_assignments_insert on public.schedule_assignments
  for insert to authenticated with check (public.is_event_leader(event_id));
create policy schedule_assignments_update on public.schedule_assignments
  for update to authenticated
  using (public.is_event_leader(event_id)) with check (public.is_event_leader(event_id));
create policy schedule_assignments_delete on public.schedule_assignments
  for delete to authenticated using (public.is_event_leader(event_id));

-- songs
create policy songs_select on public.songs
  for select to authenticated using (public.is_church_member(church_id));
create policy songs_insert on public.songs
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy songs_update on public.songs
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy songs_delete on public.songs
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- setlists
create policy setlists_select on public.setlists
  for select to authenticated using (public.is_church_member(church_id));
create policy setlists_insert on public.setlists
  for insert to authenticated with check (public.is_event_leader(event_id));
create policy setlists_update on public.setlists
  for update to authenticated
  using (public.is_event_leader(event_id)) with check (public.is_event_leader(event_id));
create policy setlists_delete on public.setlists
  for delete to authenticated using (public.is_event_leader(event_id));

-- setlist_items
create policy setlist_items_select on public.setlist_items
  for select to authenticated using (public.is_church_member(church_id));
create policy setlist_items_insert on public.setlist_items
  for insert to authenticated with check (public.is_setlist_leader(setlist_id));
create policy setlist_items_update on public.setlist_items
  for update to authenticated
  using (public.is_setlist_leader(setlist_id)) with check (public.is_setlist_leader(setlist_id));
create policy setlist_items_delete on public.setlist_items
  for delete to authenticated using (public.is_setlist_leader(setlist_id));

-- cycles: só leitura no cliente (abertura/fechamento por função)
create policy cycles_select on public.cycles
  for select to authenticated using (public.is_church_member(church_id));

-- checkins: só leitura (o próprio membro e o líder); escrita pela Edge Function
create policy checkins_select on public.checkins
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- checkin_requests: só leitura; criação/revisão por RPC (prazo e limite)
create policy checkin_requests_select on public.checkin_requests
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- justifications: membro envia (pendente, antes do evento); aprovação por RPC
create policy justifications_select on public.justifications
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy justifications_insert on public.justifications
  for insert to authenticated
  with check (
    public.can_justify_event(ministry_member_id, event_id)
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
  );
create policy justifications_delete on public.justifications
  for delete to authenticated
  using (public.is_self_member(ministry_member_id) and status = 'pending');

-- point_ledger: só leitura (o próprio membro e o líder)
create policy point_ledger_select on public.point_ledger
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- cycle_eligibility: leitura para a igreja (usado na escala)
create policy cycle_eligibility_select on public.cycle_eligibility
  for select to authenticated using (public.is_church_member(church_id));

-- quarter_plan_rules
create policy quarter_plan_rules_select on public.quarter_plan_rules
  for select to authenticated using (public.is_church_member(church_id));
create policy quarter_plan_rules_update on public.quarter_plan_rules
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));

-- invites: líder do ministério
create policy invites_select on public.invites
  for select to authenticated using (public.is_ministry_leader(ministry_id));
create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    public.is_ministry_leader(ministry_id)
    and uses_count = 0
    and revoked_at is null
    and created_by = (select auth.uid())
  );
create policy invites_update on public.invites
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy invites_delete on public.invites
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- audit_log: só o dono da igreja lê
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_church_owner(church_id));

-- -----------------------------------------------------------------------------
-- Privilégios
-- -----------------------------------------------------------------------------

-- anon não acessa tabelas (as telas públicas usam RPCs security definer)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Tabelas escritas somente por funções do servidor
revoke insert, update, delete on
  public.point_ledger,
  public.checkins,
  public.checkin_requests,
  public.cycles,
  public.cycle_eligibility,
  public.audit_log
from authenticated;

-- Colunas que o cliente pode alterar (o resto é imutável pelo front)
revoke update on public.churches from authenticated;
grant update (name, address, lat, lng, checkin_radius_m, timezone) on public.churches to authenticated;

revoke update on public.church_members from authenticated;
grant update (role) on public.church_members to authenticated;

revoke update on public.ministry_members from authenticated;
grant update (role, status) on public.ministry_members to authenticated;

revoke update on public.invites from authenticated;
grant update (revoked_at, expires_at) on public.invites to authenticated;

revoke update on public.ministry_settings from authenticated;
grant update (
  cycle_months, cycle_starting_points, cycle_min_points, late_tolerance_min,
  late_penalty_tiers, absence_penalty, checkin_request_limit_per_cycle,
  checkin_request_deadline_hours, checkin_radius_m
) on public.ministry_settings to authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- Funções: ninguém executa por padrão; liberamos explicitamente
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function
  public.is_church_member(uuid),
  public.is_church_owner(uuid),
  public.is_ministry_leader(uuid),
  public.is_ministry_member(uuid),
  public.is_self_member(uuid),
  public.is_leader_of_member(uuid),
  public.is_event_leader(uuid),
  public.is_setlist_leader(uuid),
  public.shares_church_with(uuid),
  public.can_justify_event(uuid, uuid)
to authenticated;
