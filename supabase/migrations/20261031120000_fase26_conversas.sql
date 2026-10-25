-- =============================================================================
-- Fase 26 — conversas (chat)
--
-- Três tipos de conversa, todas por igreja:
--   * ministry — grupo do ministério: todos os integrantes ativos (e o líder/dono)
--   * event    — conversa do culto: quem está escalado (menos quem recusou) e os
--                líderes. Criada junto com o culto; aparece 7 dias antes, vira
--                "arquivada" (só leitura) 1 dia depois do fim e é apagada 30 dias
--                depois do fim (job diário), para a lista não lotar.
--   * direct   — conversa entre duas pessoas da mesma igreja.
-- Quem participa do grupo e do culto é calculado na hora (sai do ministério ou
-- da escala = sai da conversa); só a conversa direta guarda os participantes.
--
-- Mensagens: o cliente só insere texto (RLS + colunas liberadas); apagar é pela
-- RPC `delete_chat_message` (a própria ou, no grupo/culto, o líder). "Lido até",
-- silenciar e o controle de avisos ficam em `chat_reads`, gravado só por RPC.
--
-- Aviso no celular: só para quem tem push ativo, não silenciou e não está com a
-- conversa aberta (leu no último minuto). Um aviso por conversa a cada 10 min
-- enquanto houver mensagem sem ler. Usa o tipo 'announcement' (só celular), que
-- a função notifications-dispatch já conhece. Conversa direta não leva o texto
-- da mensagem para a fila (o dono da igreja enxerga a fila).
--
-- "Digitando…": Realtime Broadcast em canal privado `chat:<id>`; as policies em
-- realtime.messages deixam entrar só quem acessa a conversa.
-- =============================================================================

create table public.chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches (id) on delete cascade,
  kind            text not null check (kind in ('ministry', 'event', 'direct')),
  ministry_id     uuid,
  event_id        uuid,
  -- conversa direta: "<igreja>:<menor perfil>:<maior perfil>" (uma por par)
  direct_key      text unique,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  unique (id, church_id),
  check (
    case kind
      when 'ministry' then ministry_id is not null and event_id is null and direct_key is null
      when 'event' then ministry_id is not null and event_id is not null and direct_key is null
      else ministry_id is null and event_id is null and direct_key is not null
    end
  )
);
create unique index chat_conversations_ministry_uidx on public.chat_conversations (ministry_id) where kind = 'ministry';
create unique index chat_conversations_event_uidx on public.chat_conversations (event_id) where kind = 'event';
create index chat_conversations_church_idx on public.chat_conversations (church_id);

create table public.chat_participants (
  conversation_id uuid not null,
  church_id       uuid not null,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id),
  foreign key (conversation_id, church_id) references public.chat_conversations (id, church_id) on delete cascade
);
create index chat_participants_profile_idx on public.chat_participants (profile_id);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null,
  conversation_id uuid not null,
  sender_id       uuid references public.profiles (id) on delete set null default auth.uid(),
  body            text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  foreign key (conversation_id, church_id) references public.chat_conversations (id, church_id) on delete cascade,
  check (deleted_at is not null or length(trim(body)) between 1 and 2000)
);
create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at desc);

create table public.chat_reads (
  conversation_id  uuid not null,
  church_id        uuid not null,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  last_read_at     timestamptz,
  muted            boolean not null default false,
  last_notified_at timestamptz,
  primary key (conversation_id, profile_id),
  foreign key (conversation_id, church_id) references public.chat_conversations (id, church_id) on delete cascade
);
create index chat_reads_profile_idx on public.chat_reads (profile_id);

-- -----------------------------------------------------------------------------
-- Regras de acesso
-- -----------------------------------------------------------------------------

-- Fim do culto para a conversa (sem fim marcado: 3 h depois do início)
create or replace function public.chat_event_end(p_event_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(e.ends_at, e.starts_at + interval '3 hours') from public.events e where e.id = p_event_id;
$$;
revoke execute on function public.chat_event_end(uuid) from public, anon, authenticated;

-- Pessoas da conversa (perfis), sem repetir
create or replace function public.chat_conversation_members(p_conversation_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select mm.user_id
  from public.chat_conversations c
  join public.ministry_members mm on mm.ministry_id = c.ministry_id and mm.status = 'active'
  where c.id = p_conversation_id and c.kind = 'ministry'
  union
  select mm.user_id
  from public.chat_conversations c
  join public.schedule_assignments sa on sa.event_id = c.event_id and sa.status <> 'declined'
  join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
  where c.id = p_conversation_id and c.kind = 'event'
  union
  select mm.user_id
  from public.chat_conversations c
  join public.ministry_members mm on mm.ministry_id = c.ministry_id
    and mm.status = 'active' and mm.role = 'leader'
  where c.id = p_conversation_id and c.kind = 'event'
  union
  select cp.profile_id
  from public.chat_conversations c
  join public.chat_participants cp on cp.conversation_id = c.id
  join public.church_members cm on cm.church_id = c.church_id and cm.user_id = cp.profile_id
  where c.id = p_conversation_id and c.kind = 'direct';
$$;
revoke execute on function public.chat_conversation_members(uuid) from public, anon, authenticated;

-- O usuário logado pode ler a conversa? (líder e dono leem as do ministério)
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_conversations c
    where c.id = p_conversation_id
      and (
        (c.kind in ('ministry', 'event') and public.is_ministry_leader(c.ministry_id))
        or exists (
          select 1 from public.chat_conversation_members(c.id) m
          where m.profile_id = (select auth.uid())
        )
      )
  );
$$;
revoke execute on function public.can_access_conversation(uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid) to authenticated;

-- Conversa de culto arquivada (só leitura): passou 1 dia do fim
create or replace function public.chat_is_archived(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.kind = 'event' and public.chat_event_end(c.event_id) + interval '1 day' < now()
    from public.chat_conversations c where c.id = p_conversation_id
  ), false);
$$;
revoke execute on function public.chat_is_archived(uuid) from public, anon, authenticated;

create or replace function public.can_send_to_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_conversation(p_conversation_id)
    and not public.chat_is_archived(p_conversation_id);
$$;
revoke execute on function public.can_send_to_conversation(uuid) from public, anon;
grant execute on function public.can_send_to_conversation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Conversas criadas pelo sistema: grupo de cada ministério e de cada culto
-- -----------------------------------------------------------------------------
create or replace function public.ministries_create_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_conversations (church_id, kind, ministry_id)
  values (new.church_id, 'ministry', new.id)
  on conflict do nothing;
  return new;
end;
$$;
create trigger ministries_create_chat
  after insert on public.ministries
  for each row execute function public.ministries_create_chat();
revoke execute on function public.ministries_create_chat() from public, anon, authenticated;

create or replace function public.events_create_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'service' then
    insert into public.chat_conversations (church_id, kind, ministry_id, event_id)
    values (new.church_id, 'event', new.ministry_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger events_create_chat
  after insert on public.events
  for each row execute function public.events_create_chat();
revoke execute on function public.events_create_chat() from public, anon, authenticated;

insert into public.chat_conversations (church_id, kind, ministry_id)
select church_id, 'ministry', id from public.ministries
on conflict do nothing;

insert into public.chat_conversations (church_id, kind, ministry_id, event_id)
select church_id, 'event', ministry_id, id from public.events
where kind = 'service' and coalesce(ends_at, starts_at + interval '3 hours') > now() - interval '30 days'
on conflict do nothing;

-- Conversas de culto 30 dias depois do fim são apagadas (com as mensagens)
create or replace function public.cleanup_event_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.chat_conversations c
  using public.events e
  where c.kind = 'event' and e.id = c.event_id
    and coalesce(e.ends_at, e.starts_at + interval '3 hours') < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.cleanup_event_conversations() from public, anon, authenticated;

select cron.schedule('idex-limpar-conversas-de-culto', '17 4 * * *', 'select public.cleanup_event_conversations()');

-- Abre (ou cria) a conversa direta com outra pessoa da mesma igreja
create or replace function public.open_direct_conversation(p_church_id uuid, p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_key text;
  v_id  uuid;
begin
  if v_uid is null or not public.is_church_member(p_church_id) then
    raise exception 'Sem acesso a esta igreja' using errcode = '42501';
  end if;
  if p_profile_id = v_uid then
    raise exception 'Escolha outra pessoa' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.church_members cm where cm.church_id = p_church_id and cm.user_id = p_profile_id
  ) then
    raise exception 'Esta pessoa não é da igreja' using errcode = '22023';
  end if;
  v_key := p_church_id || ':' || least(v_uid, p_profile_id) || ':' || greatest(v_uid, p_profile_id);
  insert into public.chat_conversations (church_id, kind, direct_key)
  values (p_church_id, 'direct', v_key)
  on conflict (direct_key) do nothing;
  select id into v_id from public.chat_conversations where direct_key = v_key;
  insert into public.chat_participants (conversation_id, church_id, profile_id)
  values (v_id, p_church_id, v_uid), (v_id, p_church_id, p_profile_id)
  on conflict do nothing;
  insert into public.chat_reads (conversation_id, church_id, profile_id, last_read_at)
  values (v_id, p_church_id, v_uid, now())
  on conflict (conversation_id, profile_id) do nothing;
  return v_id;
end;
$$;
revoke execute on function public.open_direct_conversation(uuid, uuid) from public, anon;
grant execute on function public.open_direct_conversation(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Mensagens
-- -----------------------------------------------------------------------------

-- Hora do servidor e remetente = quem está logado (o cliente não escolhe)
create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.sender_id := (select auth.uid());
    new.created_at := now();
    new.deleted_at := null;
  end if;
  new.body := trim(new.body);
  return new;
end;
$$;
create trigger chat_messages_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();
revoke execute on function public.chat_messages_before_insert() from public, anon, authenticated;

-- Depois de cada mensagem: atualiza a conversa, marca como lida para quem
-- enviou e avisa no celular quem não está com ela aberta.
create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv   public.chat_conversations%rowtype;
  v_sender text;
  v_title  text;
  v_body   text;
  v_any    boolean := false;
  r        record;
begin
  select * into v_conv from public.chat_conversations where id = new.conversation_id;
  update public.chat_conversations set last_message_at = new.created_at where id = new.conversation_id;

  if new.sender_id is not null then
    insert into public.chat_reads (conversation_id, church_id, profile_id, last_read_at)
    values (new.conversation_id, new.church_id, new.sender_id, new.created_at)
    on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
  end if;

  select coalesce(nullif(split_part(trim(p.full_name), ' ', 1), ''), 'Alguém') into v_sender
  from public.profiles p where p.id = new.sender_id;
  v_sender := coalesce(v_sender, 'Alguém');
  v_title := case v_conv.kind
    when 'ministry' then v_sender || ' · ' || (select m.name from public.ministries m where m.id = v_conv.ministry_id)
    when 'event' then v_sender || ' · ' || (
      select e.title || ' ' || to_char(e.starts_at at time zone 'America/Sao_Paulo', 'DD/MM')
      from public.events e where e.id = v_conv.event_id)
    else v_sender
  end;
  v_body := case
    when v_conv.kind = 'direct' then 'Nova mensagem'
    when length(new.body) > 140 then left(new.body, 139) || '…'
    else new.body
  end;

  for r in
    select m.profile_id, cr.last_read_at, cr.last_notified_at, coalesce(cr.muted, false) as muted
    from public.chat_conversation_members(new.conversation_id) m
    left join public.chat_reads cr on cr.conversation_id = new.conversation_id and cr.profile_id = m.profile_id
    where m.profile_id is distinct from new.sender_id
      and exists (select 1 from public.push_subscriptions ps where ps.profile_id = m.profile_id)
  loop
    continue when r.muted;
    -- está com a conversa aberta
    continue when r.last_read_at > now() - interval '1 minute';
    -- já foi avisado desta leva de mensagens há pouco
    continue when r.last_notified_at is not null
      and r.last_notified_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
      and r.last_notified_at > now() - interval '10 minutes';
    perform public.enqueue_notification(
      new.church_id, r.profile_id, 'announcement',
      'chat:' || new.id || ':' || r.profile_id,
      jsonb_build_object(
        'title', v_title, 'body', v_body,
        'path', '/conversas/' || new.conversation_id, 'pushOnly', true
      )
    );
    insert into public.chat_reads (conversation_id, church_id, profile_id, last_notified_at)
    values (new.conversation_id, new.church_id, r.profile_id, now())
    on conflict (conversation_id, profile_id) do update set last_notified_at = excluded.last_notified_at;
    v_any := true;
  end loop;

  if v_any then
    perform public.dispatch_notifications_http();
  end if;
  return new;
end;
$$;
create trigger chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_messages_after_insert();
revoke execute on function public.chat_messages_after_insert() from public, anon, authenticated;

-- Apagar: a própria mensagem ou, no grupo/culto, o líder do ministério
create or replace function public.delete_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg  public.chat_messages%rowtype;
  v_conv public.chat_conversations%rowtype;
begin
  select * into v_msg from public.chat_messages where id = p_message_id;
  if not found or not public.can_access_conversation(v_msg.conversation_id) then
    raise exception 'Mensagem não encontrada' using errcode = 'P0002';
  end if;
  select * into v_conv from public.chat_conversations where id = v_msg.conversation_id;
  if v_msg.sender_id is distinct from (select auth.uid())
     and not (v_conv.ministry_id is not null and public.is_ministry_leader(v_conv.ministry_id)) then
    raise exception 'Só quem enviou (ou o líder) apaga a mensagem' using errcode = '42501';
  end if;
  update public.chat_messages set deleted_at = now(), body = '' where id = p_message_id and deleted_at is null;
end;
$$;
revoke execute on function public.delete_chat_message(uuid) from public, anon;
grant execute on function public.delete_chat_message(uuid) to authenticated;

-- Marcar como lida (a tela chama ao abrir e enquanto está aberta)
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Sem acesso a esta conversa' using errcode = '42501';
  end if;
  insert into public.chat_reads (conversation_id, church_id, profile_id, last_read_at)
  select c.id, c.church_id, (select auth.uid()), now()
  from public.chat_conversations c where c.id = p_conversation_id
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'Sem acesso a esta conversa' using errcode = '42501';
  end if;
  insert into public.chat_reads (conversation_id, church_id, profile_id, muted)
  select c.id, c.church_id, (select auth.uid()), p_muted
  from public.chat_conversations c where c.id = p_conversation_id
  on conflict (conversation_id, profile_id) do update set muted = excluded.muted;
end;
$$;
revoke execute on function public.set_conversation_muted(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;

-- Lista de conversas da pessoa na igreja, com a última mensagem e não lidas.
-- Conversa de culto: aparece 7 dias antes; `archived` 1 dia depois do fim.
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
  last_deleted     boolean
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
    lm.deleted_at is not null
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

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.chat_conversations enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

create policy chat_conversations_select on public.chat_conversations
  for select to authenticated using (public.can_access_conversation(id));
create policy chat_participants_select on public.chat_participants
  for select to authenticated using (public.can_access_conversation(conversation_id));
create policy chat_messages_select on public.chat_messages
  for select to authenticated using (public.can_access_conversation(conversation_id));
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_send_to_conversation(conversation_id));
create policy chat_reads_select on public.chat_reads
  for select to authenticated using (profile_id = (select auth.uid()));

revoke insert, update, delete on public.chat_conversations, public.chat_participants, public.chat_reads
  from anon, authenticated;
revoke all on public.chat_messages from anon;
revoke insert, update, delete on public.chat_messages from authenticated;
grant insert (id, church_id, conversation_id, body) on public.chat_messages to authenticated;

-- Mensagens novas e apagadas chegam ao app pelo Realtime (respeita o RLS)
alter publication supabase_realtime add table public.chat_messages;

-- -----------------------------------------------------------------------------
-- "Digitando…" — canal privado `chat:<conversa>` (Realtime Broadcast)
-- -----------------------------------------------------------------------------
create or replace function public.can_access_chat_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.can_access_conversation(substr(p_topic, 6)::uuid),
    false
  );
$$;
revoke execute on function public.can_access_chat_topic(text) from public, anon;
grant execute on function public.can_access_chat_topic(text) to authenticated;

create policy chat_typing_select on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_access_chat_topic((select realtime.topic())));
create policy chat_typing_insert on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.can_access_chat_topic((select realtime.topic())));
