-- =============================================================================
-- Fase 2 — Escala
-- =============================================================================

-- Indisponibilidade (e o motivo) só para o próprio membro e o líder.
drop policy member_unavailability_select on public.member_unavailability;
create policy member_unavailability_select on public.member_unavailability
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- Escala: só gente e funções do mesmo ministério do evento.
create or replace function public.schedule_assignment_same_ministry()
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
  if new.ministry_role_id is not null and not exists (
    select 1
    from public.events e
    join public.ministry_roles r on r.ministry_id = e.ministry_id
    where e.id = new.event_id and r.id = new.ministry_role_id
  ) then
    raise exception 'A função não é do ministério deste evento' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger schedule_assignments_same_ministry
  before insert or update on public.schedule_assignments
  for each row execute function public.schedule_assignment_same_ministry();

revoke execute on function public.schedule_assignment_same_ministry() from public, anon;

create index if not exists schedule_assignments_event_idx on public.schedule_assignments (event_id);
create index if not exists member_unavailability_range_idx on public.member_unavailability (starts_at, ends_at);
