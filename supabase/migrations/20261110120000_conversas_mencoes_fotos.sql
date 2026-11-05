-- Conversas: citar pessoas (@Nome, @all) e enviar foto.
--
-- Menções: `chat_messages.mentions` (perfis citados) e `mention_all` (@all,
-- só em grupo/culto). O servidor filtra: só fica quem participa da conversa.
-- Quem foi citado recebe aviso no celular mesmo com a conversa silenciada e
-- sem a espera de 10 minutos entre avisos.
--
-- Fotos: bucket privado `chat-images` (até 10 MB; jpeg, png, webp, gif),
-- caminho {church_id}/{conversation_id}/{uuid}.{ext}. Lê quem acessa a
-- conversa; envia quem pode escrever nela; apaga quem enviou ou o líder
-- (grupo/culto). A mensagem guarda `image_path` (+ largura/altura para a
-- tela não pular ao carregar). Foto sem texto = corpo vazio.

alter table public.chat_messages
  add column mentions     uuid[]  not null default '{}',
  add column mention_all  boolean not null default false,
  add column image_path   text,
  add column image_width  integer,
  add column image_height integer;

alter table public.chat_messages drop constraint chat_messages_check;
alter table public.chat_messages add constraint chat_messages_check check (
  deleted_at is not null
  or (length(trim(body)) <= 2000 and (image_path is not null or length(trim(body)) >= 1))
);

grant insert (mentions, mention_all, image_path, image_width, image_height)
  on public.chat_messages to authenticated;

-- Menções e foto conferidas pelo servidor. Gatilho separado (roda depois de
-- `chat_messages_before_insert`, que fixa remetente e hora: a ordem é pelo
-- nome) e `security definer` para ler quem participa da conversa.
create or replace function public.chat_messages_check_extras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select c.kind into v_kind from public.chat_conversations c where c.id = new.conversation_id;
  -- @all só em grupo/culto
  new.mention_all := coalesce(new.mention_all, false) and v_kind in ('ministry', 'event');
  -- só quem participa da conversa (e não a própria pessoa)
  new.mentions := coalesce((
    select array_agg(distinct m.profile_id)
    from public.chat_conversation_members(new.conversation_id) m
    where m.profile_id = any (coalesce(new.mentions, '{}'))
      and m.profile_id is distinct from new.sender_id
  ), '{}');

  if new.image_path is not null then
    if new.image_path not like new.church_id || '/' || new.conversation_id || '/%'
       or new.image_path like '%..%' then
      raise exception 'Foto inválida' using errcode = '22023';
    end if;
    if new.image_width is not null and new.image_width not between 1 and 20000 then
      new.image_width := null;
    end if;
    if new.image_height is not null and new.image_height not between 1 and 20000 then
      new.image_height := null;
    end if;
  else
    new.image_width := null;
    new.image_height := null;
  end if;
  return new;
end;
$$;
create trigger chat_messages_check_extras
  before insert on public.chat_messages
  for each row execute function public.chat_messages_check_extras();
revoke execute on function public.chat_messages_check_extras() from public, anon, authenticated;

-- Depois de cada mensagem: atualiza a conversa, marca como lida para quem
-- enviou e avisa no celular. Citado (@Nome ou @all) é avisado mesmo com a
-- conversa silenciada e sem a espera de 10 min.
create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv    public.chat_conversations%rowtype;
  v_sender  text;
  v_where   text;
  v_title   text;
  v_body    text;
  v_text    text;
  v_any     boolean := false;
  v_mention boolean;
  r         record;
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
  v_where := case v_conv.kind
    when 'ministry' then (select m.name from public.ministries m where m.id = v_conv.ministry_id)
    when 'event' then (
      select e.title || ' ' || to_char(e.starts_at at time zone 'America/Sao_Paulo', 'DD/MM')
      from public.events e where e.id = v_conv.event_id)
  end;

  v_text := case
    when new.body = '' then '📷 Foto'
    when new.image_path is not null then '📷 ' || new.body
    else new.body
  end;
  if length(v_text) > 140 then v_text := left(v_text, 139) || '…'; end if;

  for r in
    select m.profile_id, cr.last_read_at, cr.last_notified_at, coalesce(cr.muted, false) as muted
    from public.chat_conversation_members(new.conversation_id) m
    left join public.chat_reads cr on cr.conversation_id = new.conversation_id and cr.profile_id = m.profile_id
    where m.profile_id is distinct from new.sender_id
      and exists (select 1 from public.push_subscriptions ps where ps.profile_id = m.profile_id)
  loop
    -- está com a conversa aberta
    continue when r.last_read_at > now() - interval '1 minute';
    v_mention := new.mention_all or r.profile_id = any (new.mentions);
    if not v_mention then
      continue when r.muted;
      -- já foi avisado desta leva de mensagens há pouco
      continue when r.last_notified_at is not null
        and r.last_notified_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
        and r.last_notified_at > now() - interval '10 minutes';
    end if;

    if v_mention then
      v_title := v_sender || case when new.mention_all then ' chamou todos' else ' mencionou você' end
        || coalesce(' · ' || v_where, '');
      v_body := v_text;
    elsif v_conv.kind = 'direct' then
      v_title := v_sender;
      v_body := 'Nova mensagem';
    else
      v_title := v_sender || coalesce(' · ' || v_where, '');
      v_body := v_text;
    end if;

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
revoke execute on function public.chat_messages_after_insert() from public, anon, authenticated;

-- Apagar: a própria mensagem ou, no grupo/culto, o líder (a foto some da
-- mensagem; o app apaga o arquivo)
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
  update public.chat_messages
    set deleted_at = now(), body = '', image_path = null, image_width = null,
        image_height = null, mentions = '{}', mention_all = false
    where id = p_message_id and deleted_at is null;
end;
$$;

-- Pessoas da conversa (para sugerir ao digitar @)
create or replace function public.conversation_people(p_conversation_id uuid)
returns table (profile_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id, coalesce(nullif(trim(p.full_name), ''), 'Sem nome')
  from public.chat_conversation_members(p_conversation_id) m
  join public.profiles p on p.id = m.profile_id
  where public.can_access_conversation(p_conversation_id)
  order by 2;
$$;
revoke execute on function public.conversation_people(uuid) from public, anon;
grant execute on function public.conversation_people(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage das fotos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- {church_id}/{conversation_id}/…: a 2ª pasta é a conversa
create or replace function public.storage_conversation_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[2]::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.storage_conversation_id(text) to authenticated;

-- Pode apagar a foto da conversa: quem enviou (dono do arquivo) ou o líder no grupo/culto
create or replace function public.can_moderate_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_conversations c
    where c.id = p_conversation_id
      and c.kind in ('ministry', 'event')
      and public.is_ministry_leader(c.ministry_id)
  );
$$;
revoke execute on function public.can_moderate_conversation(uuid) from public, anon;
grant execute on function public.can_moderate_conversation(uuid) to authenticated;

create policy chat_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-images'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

create policy chat_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and public.can_send_to_conversation(public.storage_conversation_id(name))
    and exists (
      select 1 from public.chat_conversations c
      where c.id = public.storage_conversation_id(name)
        and c.church_id = public.storage_church_id(name)
    )
  );

create policy chat_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (
      owner_id = (select auth.uid())::text
      or public.can_moderate_conversation(public.storage_conversation_id(name))
    )
  );
