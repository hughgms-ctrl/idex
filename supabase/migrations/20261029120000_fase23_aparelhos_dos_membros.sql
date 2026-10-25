-- =============================================================================
-- Fase 23 — Membros: o líder vê quem instalou o app e quem ativou os avisos
--
-- "Instalou" = já abriu o app instalado (display-mode standalone); o próprio
-- app avisa por `mark_app_installed` ao abrir. "Avisos" = tem ao menos um
-- aparelho em `push_subscriptions`. Só o líder do ministério enxerga.
-- =============================================================================
alter table public.profiles add column app_installed_at timestamptz;

create or replace function public.mark_app_installed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set app_installed_at = now()
  where id = (select auth.uid())
    and (app_installed_at is null or app_installed_at < now() - interval '1 day');
$$;
revoke execute on function public.mark_app_installed() from public, anon;
grant execute on function public.mark_app_installed() to authenticated;

create or replace function public.ministry_member_devices(p_ministry_id uuid)
returns table (ministry_member_id uuid, app_installed boolean, push_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    mm.id,
    p.app_installed_at is not null,
    exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
  from public.ministry_members mm
  join public.profiles p on p.id = mm.user_id
  where public.is_ministry_leader(p_ministry_id)
    and mm.ministry_id = p_ministry_id;
$$;
revoke execute on function public.ministry_member_devices(uuid) from public, anon;
grant execute on function public.ministry_member_devices(uuid) to authenticated;
