-- =============================================================================
-- Fase 20 — central de avisos: quem vai receber e quem recebeu
--
-- A fila (`notification_queue`) só é visível para a própria pessoa e o dono da
-- igreja; estas funções mostram a quem usa a central (líder ou permissão
-- 'announcements') só o necessário: nome e canal de cada pessoa.
-- =============================================================================

-- Antes de enviar: quem está no público e por onde pode receber
create or replace function public.announcement_audience_people(
  p_ministry_id uuid,
  p_audience    text,
  p_event_id    uuid default null,
  p_member_ids  uuid[] default '{}'
)
returns table (profile_id uuid, full_name text, has_push boolean, has_whatsapp boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (p.id)
    p.id,
    coalesce(nullif(trim(p.full_name), ''), 'Sem nome'),
    exists (select 1 from public.push_subscriptions s where s.profile_id = p.id),
    not p.whatsapp_opt_out and coalesce(p.phone, '') <> ''
  from public.ministry_members mm
  join public.profiles p on p.id = mm.user_id
  where public.has_ministry_permission(p_ministry_id, 'announcements')
    and mm.ministry_id = p_ministry_id and mm.status = 'active'
    and case p_audience
          when 'all' then true
          when 'leaders' then mm.role = 'leader'
          when 'members' then mm.id = any (p_member_ids)
          when 'event' then exists (
            select 1 from public.schedule_assignments sa
            where sa.event_id = p_event_id
              and sa.ministry_member_id = mm.id
              and sa.status in ('scheduled', 'confirmed')
          )
          else false
        end
  order by p.id;
$$;
revoke execute on function public.announcement_audience_people(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.announcement_audience_people(uuid, text, uuid, uuid[]) to authenticated;

-- Depois de enviar: a situação de cada pessoa na fila
create or replace function public.announcement_deliveries(p_announcement_id uuid)
returns table (
  profile_id   uuid,
  full_name    text,
  status       public.notification_status,
  push_sent_at timestamptz,
  sent_at      timestamptz,
  has_whatsapp boolean,
  last_error   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    q.profile_id,
    coalesce(nullif(trim(p.full_name), ''), 'Sem nome'),
    q.status,
    q.push_sent_at,
    q.sent_at,
    not p.whatsapp_opt_out and coalesce(p.phone, '') <> '',
    q.last_error
  from public.announcements a
  join public.notification_queue q on q.dedupe_key like 'announcement:' || a.id || ':%'
  join public.profiles p on p.id = q.profile_id
  where a.id = p_announcement_id
    and public.has_ministry_permission(a.ministry_id, 'announcements')
  order by 2;
$$;
revoke execute on function public.announcement_deliveries(uuid) from public, anon;
grant execute on function public.announcement_deliveries(uuid) to authenticated;
