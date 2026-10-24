-- Fase 15 — disponibilidade para o ensaio de cada culto
-- O integrante diz, por culto, se pode ensaiar em qualquer dia, só em alguns
-- (com observação: "só terça", "quarta não") ou em nenhum. O líder usa isso para
-- marcar/remarcar o ensaio. Fica no culto (o ensaio pode mudar de dia).

create table public.rehearsal_availability (
  church_id          uuid not null,
  event_id           uuid not null, -- o culto
  ministry_member_id uuid not null,
  status             text not null check (status in ('any', 'some', 'none')),
  note               text check (note is null or length(note) <= 300),
  updated_at         timestamptz not null default now(),
  primary key (event_id, ministry_member_id),
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  foreign key (ministry_member_id, church_id) references public.ministry_members (id, church_id) on delete cascade
);
create index rehearsal_availability_member_idx on public.rehearsal_availability (ministry_member_id);
create index rehearsal_availability_church_idx on public.rehearsal_availability (church_id);

alter table public.rehearsal_availability enable row level security;
-- o próprio membro e o líder dele (igual a event_availability)
create policy rehearsal_availability_select on public.rehearsal_availability
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy rehearsal_availability_insert on public.rehearsal_availability
  for insert to authenticated
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy rehearsal_availability_update on public.rehearsal_availability
  for update to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id))
  with check (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
create policy rehearsal_availability_delete on public.rehearsal_availability
  for delete to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));

-- mesmo ministério do culto; atualiza a data
create trigger rehearsal_availability_guard
  before insert or update on public.rehearsal_availability
  for each row execute function public.event_availability_guard();
