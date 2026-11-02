-- =============================================================================
-- Tipos de música (celebração, louvor, adoração, ofertório, ceia…)
--  - song_categories: lista do ministério (o líder cadastra, renomeia, apaga).
--  - songs.category_ids: os tipos de cada música (pode ter mais de um).
--  - quarter_plan_rules.category_slots: a estrutura do culto, em ordem
--    ([{ "categoryId": "…", "count": 2 }, …]); o "Sugerir com regras" preenche
--    cada parte com músicas do tipo.
-- =============================================================================

create table public.song_categories (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  ministry_id uuid not null,
  name        text not null check (length(trim(name)) between 1 and 30),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (ministry_id, name),
  unique (id, church_id)
);
create index song_categories_church_idx on public.song_categories (church_id);

alter table public.song_categories enable row level security;
create policy song_categories_select on public.song_categories
  for select to authenticated using (public.is_church_member(church_id));
create policy song_categories_insert on public.song_categories
  for insert to authenticated with check (public.is_ministry_leader(ministry_id));
create policy song_categories_update on public.song_categories
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));
create policy song_categories_delete on public.song_categories
  for delete to authenticated using (public.is_ministry_leader(ministry_id));

alter table public.songs add column category_ids uuid[] not null default '{}';

-- Só tipos do próprio ministério, sem repetir
create or replace function public.songs_categories_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.category_ids := array(select distinct c from unnest(new.category_ids) c where c is not null);
  if exists (
    select 1 from unnest(new.category_ids) c
    where not exists (
      select 1 from public.song_categories sc where sc.id = c and sc.ministry_id = new.ministry_id
    )
  ) then
    raise exception 'Tipo de música de outro ministério' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.songs_categories_guard() from public, anon, authenticated;

create trigger songs_categories_guard
  before insert or update of category_ids, ministry_id on public.songs
  for each row execute function public.songs_categories_guard();

-- Apagar um tipo tira das músicas e da estrutura do culto
create or replace function public.song_categories_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.songs
  set category_ids = array_remove(category_ids, old.id)
  where ministry_id = old.ministry_id and old.id = any (category_ids);
  update public.quarter_plan_rules
  set category_slots = coalesce((
    select jsonb_agg(s) from jsonb_array_elements(category_slots) s
    where s ->> 'categoryId' <> old.id::text
  ), '[]'::jsonb)
  where ministry_id = old.ministry_id;
  return old;
end;
$$;
revoke execute on function public.song_categories_cleanup() from public, anon, authenticated;

create trigger song_categories_cleanup
  after delete on public.song_categories
  for each row execute function public.song_categories_cleanup();

alter table public.quarter_plan_rules
  add column category_slots jsonb not null default '[]'
  check (jsonb_typeof(category_slots) = 'array' and jsonb_array_length(category_slots) <= 12);

comment on column public.quarter_plan_rules.category_slots is
  'Estrutura do culto em ordem: [{"categoryId": uuid, "count": 1..10}]. Vazio = sem regra de tipo.';
