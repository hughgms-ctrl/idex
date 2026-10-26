-- =============================================================================
-- Fase 28 — ensaios separados por função (ex.: banda e vozes)
--
-- * rehearsal_groups: o líder define os ensaios de cada culto ("Ensaio da
--   banda", "Ensaio de vozes"), com as funções que vão a cada um e o dia/horário
--   padrão. Sem nenhum, continua um ensaio só com a equipe inteira.
-- * events.rehearsal_group_id: o ensaio de um culto diz de qual grupo é. Um
--   culto pode ter um ensaio por grupo (antes: um só).
-- * A equipe do culto vai só para o ensaio da sua função (quem tem duas funções
--   pode ir aos dois). Quem está escalado sem função vai a todos.
-- =============================================================================

create table public.rehearsal_groups (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null,
  ministry_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 40),
  sort_order   integer not null default 0,
  role_ids     uuid[] not null default '{}',
  mode         text not null default 'days_before' check (mode in ('days_before', 'weekday')),
  days_before  integer not null default 3 check (days_before between 0 and 7),
  weekday      integer check (weekday between 0 and 6),
  time         time not null default '20:00',
  duration_min integer not null default 120 check (duration_min between 15 and 600),
  created_at   timestamptz not null default now(),
  constraint rehearsal_groups_weekday_required check (mode <> 'weekday' or weekday is not null),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (ministry_id, name),
  unique (id, church_id)
);
create index rehearsal_groups_church_idx on public.rehearsal_groups (church_id);

alter table public.rehearsal_groups enable row level security;
create policy rehearsal_groups_select on public.rehearsal_groups
  for select to authenticated using (public.is_church_member(church_id));
create policy rehearsal_groups_insert on public.rehearsal_groups
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy rehearsal_groups_update on public.rehearsal_groups
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy rehearsal_groups_delete on public.rehearsal_groups
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

-- Funções do próprio ministério, sem repetir
create or replace function public.rehearsal_groups_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.role_ids := array(select distinct r from unnest(new.role_ids) r where r is not null);
  if exists (
    select 1 from unnest(new.role_ids) r
    where not exists (select 1 from public.ministry_roles mr where mr.id = r and mr.ministry_id = new.ministry_id)
  ) then
    raise exception 'Função de outro ministério' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.rehearsal_groups_guard() from public, anon, authenticated;
create trigger rehearsal_groups_guard
  before insert or update on public.rehearsal_groups
  for each row execute function public.rehearsal_groups_guard();

-- Função apagada sai dos grupos
create or replace function public.ministry_roles_leave_groups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rehearsal_groups
  set role_ids = array_remove(role_ids, old.id)
  where ministry_id = old.ministry_id and old.id = any (role_ids);
  return null;
end;
$$;
revoke execute on function public.ministry_roles_leave_groups() from public, anon, authenticated;
create trigger ministry_roles_leave_groups
  after delete on public.ministry_roles
  for each row execute function public.ministry_roles_leave_groups();

-- -----------------------------------------------------------------------------
-- Ensaio ligado a um grupo
-- -----------------------------------------------------------------------------
alter table public.events
  add column rehearsal_group_id uuid,
  add constraint events_rehearsal_group_link check (rehearsal_group_id is null or service_event_id is not null),
  add constraint events_rehearsal_group_fk foreign key (rehearsal_group_id, church_id)
    references public.rehearsal_groups (id, church_id) on delete set null (rehearsal_group_id);

drop index public.events_one_rehearsal_per_service;
create unique index events_one_rehearsal_per_group on public.events (service_event_id, rehearsal_group_id)
  nulls not distinct where service_event_id is not null;

-- Apagar um grupo apaga os ensaios dele que ainda não aconteceram
-- (os que já passaram ficam, sem grupo, com o histórico de presença).
create or replace function public.rehearsal_groups_drop_future()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.events where rehearsal_group_id = old.id and starts_at > now();
  return old;
end;
$$;
revoke execute on function public.rehearsal_groups_drop_future() from public, anon, authenticated;
create trigger rehearsal_groups_drop_future
  before delete on public.rehearsal_groups
  for each row execute function public.rehearsal_groups_drop_future();

-- O ensaio precisa ser do mesmo ministério, de um culto, e antes dele; o grupo também
create or replace function public.events_rehearsal_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.events%rowtype;
begin
  if new.service_event_id is null then
    return new;
  end if;
  select * into v_service from public.events where id = new.service_event_id;
  if v_service.ministry_id <> new.ministry_id or v_service.kind <> 'service' then
    raise exception 'O ensaio precisa ser de um culto do mesmo ministério' using errcode = '22023';
  end if;
  if new.starts_at >= v_service.starts_at then
    raise exception 'O ensaio precisa ser antes do culto' using errcode = '22023';
  end if;
  if new.rehearsal_group_id is not null and not exists (
    select 1 from public.rehearsal_groups g
    where g.id = new.rehearsal_group_id and g.ministry_id = new.ministry_id
  ) then
    raise exception 'Grupo de ensaio de outro ministério' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger events_rehearsal_guard on public.events;
create trigger events_rehearsal_guard
  before insert or update of service_event_id, rehearsal_group_id, starts_at, ministry_id, kind on public.events
  for each row execute function public.events_rehearsal_guard();

-- -----------------------------------------------------------------------------
-- Quem vai a cada ensaio
-- -----------------------------------------------------------------------------

-- Este ensaio é para esta função? (sem grupo = todos; sem função = todos)
create or replace function public.rehearsal_takes_role(p_rehearsal_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_role_id is null or coalesce((
    select p_role_id = any (g.role_ids)
    from public.events r join public.rehearsal_groups g on g.id = r.rehearsal_group_id
    where r.id = p_rehearsal_id
  ), true);
$$;
revoke execute on function public.rehearsal_takes_role(uuid, uuid) from public, anon, authenticated;

-- Acerta a equipe de um ensaio pela equipe do culto: entra quem é da função,
-- sai quem veio do culto com uma função que não é deste ensaio (quem o líder
-- pôs à mão no ensaio, sem estar no culto, fica).
create or replace function public.sync_rehearsal_team(p_rehearsal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service uuid;
begin
  select service_event_id into v_service from public.events where id = p_rehearsal_id;
  if v_service is null then
    return;
  end if;
  delete from public.schedule_assignments ra
  where ra.event_id = p_rehearsal_id
    and not public.rehearsal_takes_role(p_rehearsal_id, ra.ministry_role_id)
    and exists (select 1 from public.schedule_assignments sa
                where sa.event_id = v_service
                  and sa.ministry_member_id = ra.ministry_member_id
                  and sa.ministry_role_id is not distinct from ra.ministry_role_id);
  insert into public.schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
  select sa.church_id, p_rehearsal_id, sa.ministry_member_id, sa.ministry_role_id
  from public.schedule_assignments sa
  where sa.event_id = v_service
    and sa.status not in ('declined', 'benched')
    and public.rehearsal_takes_role(p_rehearsal_id, sa.ministry_role_id)
  on conflict do nothing;
end;
$$;
revoke execute on function public.sync_rehearsal_team(uuid) from public, anon, authenticated;

-- Ensaio criado depois da escala (ou mudou de grupo): monta a equipe
create or replace function public.copy_service_team_to_rehearsal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.service_event_id is not null
     and (tg_op = 'INSERT'
          or old.service_event_id is distinct from new.service_event_id
          or old.rehearsal_group_id is distinct from new.rehearsal_group_id) then
    perform public.sync_rehearsal_team(new.id);
  end if;
  return null;
end;
$$;
drop trigger events_copy_service_team on public.events;
create trigger events_copy_service_team
  after insert or update of service_event_id, rehearsal_group_id on public.events
  for each row execute function public.copy_service_team_to_rehearsal();

-- Mudou as funções de um grupo: acerta os ensaios que ainda não aconteceram
create or replace function public.rehearsal_groups_resync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if old.role_ids is distinct from new.role_ids then
    for v_id in
      select id from public.events where rehearsal_group_id = new.id and starts_at > now()
    loop
      perform public.sync_rehearsal_team(v_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.rehearsal_groups_resync() from public, anon, authenticated;
create trigger rehearsal_groups_resync
  after update of role_ids on public.rehearsal_groups
  for each row execute function public.rehearsal_groups_resync();

-- Espelho culto → ensaios: cada escala vai só aos ensaios da sua função.
-- Mudar só o status (ex.: ficar de fora do culto) não mexe nos ensaios;
-- recusar ('declined') tira de todos.
create or replace function public.mirror_service_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.ministry_member_id = new.ministry_member_id
     and old.ministry_role_id is not distinct from new.ministry_role_id then
    if new.status = 'declined' and old.status <> 'declined' then
      delete from public.schedule_assignments
      where event_id in (select id from public.events where service_event_id = new.event_id)
        and ministry_member_id = new.ministry_member_id
        and ministry_role_id is not distinct from new.ministry_role_id;
    end if;
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    delete from public.schedule_assignments
    where event_id in (select id from public.events where service_event_id = old.event_id)
      and ministry_member_id = old.ministry_member_id
      and ministry_role_id is not distinct from old.ministry_role_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status not in ('declined', 'benched') then
    insert into public.schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
    select new.church_id, r.id, new.ministry_member_id, new.ministry_role_id
    from public.events r
    where r.service_event_id = new.event_id
      and public.rehearsal_takes_role(r.id, new.ministry_role_id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;
