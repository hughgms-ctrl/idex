-- =============================================================================
-- Arquivar conversas
--
-- Cada pessoa pode arquivar uma conversa (grupo, culto ou direta): ela sai da
-- lista principal e vai para "Arquivadas". Quando chega mensagem nova, a
-- conversa volta sozinha para a lista (ninguém perde recado). Para não receber
-- avisos, continua existindo o "silenciar".
-- =============================================================================

alter table public.chat_reads add column archived_at timestamptz;

create or replace function public.set_conversation_archived(p_conversation_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Sem acesso a esta conversa' using errcode = '42501';
  end if;
  insert into public.chat_reads (conversation_id, church_id, profile_id, archived_at)
  select c.id, c.church_id, (select auth.uid()), case when p_archived then now() end
  from public.chat_conversations c where c.id = p_conversation_id
  on conflict (conversation_id, profile_id) do update set archived_at = excluded.archived_at;
end;
$$;
revoke execute on function public.set_conversation_archived(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;

-- Lista de conversas: nova coluna `user_archived` (o tipo de retorno mudou)
drop function public.my_conversations(uuid);
create or replace function public.my_conversations(p_church_id uuid)
returns table (
  id               uuid,
  kind             text,
  ministry_id      uuid,
  event_id         uuid,
  title            text,
  event_starts_at  timestamptz,
  other_profile_id uuid,
  archived         boolean,
  muted            boolean,
  unread           integer,
  last_message_at  timestamptz,
  last_body        text,
  last_sender_id   uuid,
  last_sender_name text,
  last_deleted     boolean,
  user_archived    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.*,
      case when c.kind = 'event' then public.chat_event_end(c.event_id) end as event_end
    from public.chat_conversations c
    where c.church_id = p_church_id
      and public.is_church_member(p_church_id)
      and public.can_access_conversation(c.id)
  )
  select
    c.id,
    c.kind,
    c.ministry_id,
    c.event_id,
    case c.kind
      when 'ministry' then m.name
      when 'event' then e.title
      else coalesce(nullif(trim(op.full_name), ''), 'Sem nome')
    end,
    e.starts_at,
    other.profile_id,
    coalesce(c.event_end + interval '1 day' < now(), false),
    coalesce(cr.muted, false),
    (
      select least(count(*), 99)::integer from public.chat_messages cm
      where cm.conversation_id = c.id
        and cm.deleted_at is null
        and cm.sender_id is distinct from (select auth.uid())
        and cm.created_at > coalesce(cr.last_read_at, now() - interval '14 days')
    ),
    c.last_message_at,
    lm.body,
    lm.sender_id,
    coalesce(nullif(trim(sp.full_name), ''), 'Sem nome'),
    lm.deleted_at is not null,
    -- arquivada pela pessoa; mensagem nova depois disso traz de volta
    coalesce(cr.archived_at is not null
             and coalesce(c.last_message_at, '-infinity'::timestamptz) <= cr.archived_at, false)
  from mine c
  left join public.ministries m on m.id = c.ministry_id
  left join public.events e on e.id = c.event_id
  left join lateral (
    select cp.profile_id from public.chat_participants cp
    where cp.conversation_id = c.id and cp.profile_id <> (select auth.uid())
    limit 1
  ) other on c.kind = 'direct'
  left join public.profiles op on op.id = other.profile_id
  left join public.chat_reads cr on cr.conversation_id = c.id and cr.profile_id = (select auth.uid())
  left join lateral (
    select cm.body, cm.sender_id, cm.deleted_at from public.chat_messages cm
    where cm.conversation_id = c.id order by cm.created_at desc limit 1
  ) lm on true
  left join public.profiles sp on sp.id = lm.sender_id
  where (c.kind <> 'event' or e.starts_at <= now() + interval '7 days')
    -- conversa direta sem mensagem só aparece para quem abriu
    and (c.kind <> 'direct' or c.last_message_at is not null or cr.profile_id is not null)
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;
revoke execute on function public.my_conversations(uuid) from public, anon;
grant execute on function public.my_conversations(uuid) to authenticated;
