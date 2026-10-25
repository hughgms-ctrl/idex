-- No iPhone/iPad os avisos só funcionam com o app instalado (iOS 16.4+): ter
-- um aparelho iPhone/iPad em `push_subscriptions` já prova a instalação, mesmo
-- que a pessoa ainda não tenha aberto a versão que grava `app_installed_at`.
create or replace function public.ministry_member_devices(p_ministry_id uuid)
returns table (ministry_member_id uuid, app_installed boolean, push_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    mm.id,
    p.app_installed_at is not null or exists (
      select 1 from public.push_subscriptions s
      where s.profile_id = p.id and s.user_agent ~ '(iPhone|iPad|iPod)'
    ),
    exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
  from public.ministry_members mm
  join public.profiles p on p.id = mm.user_id
  where public.is_ministry_leader(p_ministry_id)
    and mm.ministry_id = p_ministry_id;
$$;
