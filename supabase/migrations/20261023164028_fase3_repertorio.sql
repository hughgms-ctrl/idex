-- =============================================================================
-- Fase 3 — Repertório e cifras
-- O setlist de um culto pode ser montado pelo líder ou pelo ministro escalado
-- naquele culto (o tom que ele escolher vale para a banda toda).
-- =============================================================================

-- Usuário logado está escalado como ministro(a) no evento?
create or replace function public.is_event_minister(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_assignments sa
    join public.ministry_members mm on mm.id = sa.ministry_member_id
    join public.ministry_roles r on r.id = sa.ministry_role_id
    where sa.event_id = p_event_id
      and mm.user_id = (select auth.uid())
      and r.name ilike 'ministr%'
  );
$$;

create or replace function public.can_edit_setlist_of_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_event_leader(p_event_id) or public.is_event_minister(p_event_id);
$$;

create or replace function public.can_edit_setlist(p_setlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.setlists s
    where s.id = p_setlist_id and public.can_edit_setlist_of_event(s.event_id)
  );
$$;

revoke execute on function
  public.is_event_minister(uuid),
  public.can_edit_setlist_of_event(uuid),
  public.can_edit_setlist(uuid)
from public, anon;
grant execute on function
  public.is_event_minister(uuid),
  public.can_edit_setlist_of_event(uuid),
  public.can_edit_setlist(uuid)
to authenticated;

drop policy setlists_insert on public.setlists;
drop policy setlists_update on public.setlists;
drop policy setlists_delete on public.setlists;
create policy setlists_insert on public.setlists
  for insert to authenticated with check (public.can_edit_setlist_of_event(event_id));
create policy setlists_update on public.setlists
  for update to authenticated
  using (public.can_edit_setlist_of_event(event_id)) with check (public.can_edit_setlist_of_event(event_id));
create policy setlists_delete on public.setlists
  for delete to authenticated using (public.can_edit_setlist_of_event(event_id));

drop policy setlist_items_insert on public.setlist_items;
drop policy setlist_items_update on public.setlist_items;
drop policy setlist_items_delete on public.setlist_items;
create policy setlist_items_insert on public.setlist_items
  for insert to authenticated with check (public.can_edit_setlist(setlist_id));
create policy setlist_items_update on public.setlist_items
  for update to authenticated
  using (public.can_edit_setlist(setlist_id)) with check (public.can_edit_setlist(setlist_id));
create policy setlist_items_delete on public.setlist_items
  for delete to authenticated using (public.can_edit_setlist(setlist_id));

-- A mesma música não entra duas vezes no mesmo setlist
alter table public.setlist_items
  add constraint setlist_items_unique_song unique (setlist_id, song_id);

-- Música e setlist têm de ser do mesmo ministério
create or replace function public.setlist_item_same_ministry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.setlists s
    join public.events e on e.id = s.event_id
    join public.songs so on so.ministry_id = e.ministry_id
    where s.id = new.setlist_id and so.id = new.song_id
  ) then
    raise exception 'A música não é do repertório deste ministério' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger setlist_items_same_ministry
  before insert or update on public.setlist_items
  for each row execute function public.setlist_item_same_ministry();

revoke execute on function public.setlist_item_same_ministry() from public, anon;
