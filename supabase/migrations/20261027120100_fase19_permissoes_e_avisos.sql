-- =============================================================================
-- Fase 19 — permissões individuais por integrante e central de avisos
--
-- 1) Permissões
-- Algumas pessoas (ex.: diretor musical) precisam cuidar do repertório sem ser
-- líder do ministério. O líder liga "chavinhas" no integrante:
--   * can_edit_songs       — cadastra e edita músicas e cifras, importa do Cifra Club
--   * can_manage_song_files — envia, renomeia e apaga áudios, PDFs e imagens
--   * can_edit_setlists    — monta o setlist de qualquer culto do ministério
--   * can_send_announcements — usa a central de avisos
-- Apagar música, escala, pontos e configurações continuam só do líder.
--
-- 2) Central de avisos (`announcements`): o líder escreve um aviso (ou parte de
-- um modelo: ensaio, culto…), escolhe para quem (todos, líderes, equipe de um
-- evento ou pessoas escolhidas), o canal (só celular ou celular + WhatsApp) e
-- a hora. O job `dispatch_announcements` (pg_cron, a cada minuto) coloca na
-- `notification_queue` uma linha por pessoa no horário marcado; o envio é o
-- mesmo dos outros avisos (`notifications-dispatch`).
-- =============================================================================

alter table public.ministry_members
  add column can_edit_songs        boolean not null default false,
  add column can_manage_song_files boolean not null default false,
  add column can_edit_setlists     boolean not null default false,
  add column can_send_announcements boolean not null default false;

grant update (can_edit_songs, can_manage_song_files, can_edit_setlists, can_send_announcements)
  on public.ministry_members to authenticated;

-- O usuário logado tem esta permissão no ministério? (líder sempre tem)
create or replace function public.has_ministry_permission(p_ministry_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_ministry_leader(p_ministry_id) or exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = p_ministry_id
      and mm.user_id = (select auth.uid())
      and mm.status = 'active'
      and case p_permission
            when 'songs' then mm.can_edit_songs
            when 'song_files' then mm.can_manage_song_files
            when 'setlists' then mm.can_edit_setlists
            when 'announcements' then mm.can_send_announcements
            else false
          end
  );
$$;
revoke execute on function public.has_ministry_permission(uuid, text) from public, anon;
grant execute on function public.has_ministry_permission(uuid, text) to authenticated;

-- Músicas e cifras: criar e editar com a permissão; apagar continua do líder
drop policy songs_insert on public.songs;
drop policy songs_update on public.songs;
create policy songs_insert on public.songs
  for insert to authenticated with check (public.has_ministry_permission(ministry_id, 'songs'));
create policy songs_update on public.songs
  for update to authenticated
  using (public.has_ministry_permission(ministry_id, 'songs'))
  with check (public.has_ministry_permission(ministry_id, 'songs'));

-- Arquivos (tabela e Storage usam can_manage_song)
create or replace function public.can_manage_song(p_song_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.songs s
    where s.id = p_song_id and public.has_ministry_permission(s.ministry_id, 'song_files')
  );
$$;

-- Setlist: líder, ministro escalado ou quem tem a permissão
create or replace function public.can_edit_setlist_of_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_event_leader(p_event_id)
    or public.is_event_minister(p_event_id)
    or exists (
      select 1 from public.events e
      where e.id = p_event_id and public.has_ministry_permission(e.ministry_id, 'setlists')
    );
$$;

-- =============================================================================
-- 2) Central de avisos
-- =============================================================================
create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null,
  ministry_id      uuid not null,
  title            text not null check (length(trim(title)) between 1 and 80),
  body             text not null check (length(trim(body)) between 1 and 1000),
  -- all: todos ativos | leaders: líderes | event: equipe de um evento | members: escolhidos
  audience         text not null default 'all' check (audience in ('all', 'leaders', 'event', 'members')),
  event_id         uuid,
  member_ids       uuid[] not null default '{}',
  -- push: só no celular | push_whatsapp: celular e WhatsApp
  channel          text not null default 'push' check (channel in ('push', 'push_whatsapp')),
  send_at          timestamptz not null default now(),
  status           text not null default 'scheduled' check (status in ('scheduled', 'sent', 'canceled')),
  sent_at          timestamptz,
  recipients_count integer,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  foreign key (event_id, church_id) references public.events (id, church_id) on delete cascade,
  check (audience <> 'event' or event_id is not null),
  check (audience <> 'members' or cardinality(member_ids) > 0)
);
create index announcements_ministry_idx on public.announcements (ministry_id, send_at desc);
create index announcements_due_idx on public.announcements (send_at) where status = 'scheduled';

-- Evento do mesmo ministério; pessoas escolhidas só do ministério; o cliente
-- não marca como enviado nem mexe em aviso que já saiu. Sem security definer:
-- `current_user` precisa ser quem gravou (o job roda como dono).
create or replace function public.announcements_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'scheduled' then
    raise exception 'Este aviso já foi enviado ou cancelado' using errcode = '22023';
  end if;
  if current_user = 'authenticated' then
    if new.status = 'sent' then
      raise exception 'O aviso é marcado como enviado pelo sistema' using errcode = '42501';
    end if;
    new.sent_at := null;
    new.recipients_count := null;
  end if;
  if new.event_id is not null and not exists (
    select 1 from public.events e where e.id = new.event_id and e.ministry_id = new.ministry_id
  ) then
    raise exception 'Evento de outro ministério' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(new.member_ids) as x(id)
    where not exists (
      select 1 from public.ministry_members mm where mm.id = x.id and mm.ministry_id = new.ministry_id
    )
  ) then
    raise exception 'Integrante de outro ministério' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger announcements_guard
  before insert or update on public.announcements
  for each row execute function public.announcements_guard();
revoke execute on function public.announcements_guard() from public, anon, authenticated;

alter table public.announcements enable row level security;
create policy announcements_select on public.announcements
  for select to authenticated using (public.has_ministry_permission(ministry_id, 'announcements'));
create policy announcements_insert on public.announcements
  for insert to authenticated with check (public.has_ministry_permission(ministry_id, 'announcements'));
create policy announcements_update on public.announcements
  for update to authenticated
  using (public.has_ministry_permission(ministry_id, 'announcements'))
  with check (public.has_ministry_permission(ministry_id, 'announcements'));
create policy announcements_delete on public.announcements
  for delete to authenticated using (public.has_ministry_permission(ministry_id, 'announcements'));
revoke update on public.announcements from authenticated;
grant update (title, body, audience, event_id, member_ids, channel, send_at, status)
  on public.announcements to authenticated;

-- Quem recebe o aviso (perfis, sem repetir)
create or replace function public.announcement_recipients(p_announcement_id uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct mm.user_id
  from public.announcements a
  join public.ministry_members mm on mm.ministry_id = a.ministry_id and mm.status = 'active'
  where a.id = p_announcement_id
    and case a.audience
          when 'all' then true
          when 'leaders' then mm.role = 'leader'
          when 'members' then mm.id = any (a.member_ids)
          when 'event' then exists (
            select 1 from public.schedule_assignments sa
            where sa.event_id = a.event_id
              and sa.ministry_member_id = mm.id
              and sa.status in ('scheduled', 'confirmed')
          )
          else false
        end;
$$;
revoke execute on function public.announcement_recipients(uuid) from public, anon, authenticated;

-- Quantas pessoas recebem (prévia na tela, antes de enviar)
create or replace function public.count_announcement_audience(
  p_ministry_id uuid,
  p_audience    text,
  p_event_id    uuid default null,
  p_member_ids  uuid[] default '{}'
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.has_ministry_permission(p_ministry_id, 'announcements') then 0 else (
    select count(distinct mm.user_id)::integer
    from public.ministry_members mm
    where mm.ministry_id = p_ministry_id and mm.status = 'active'
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
  ) end;
$$;
revoke execute on function public.count_announcement_audience(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function public.count_announcement_audience(uuid, text, uuid, uuid[]) to authenticated;

-- Envia os avisos que venceram (idempotente: dedupe por aviso + pessoa)
create or replace function public.dispatch_announcements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a     public.announcements%rowtype;
  v_event public.events%rowtype;
  v_total integer := 0;
  v_count integer;
  v_path  text;
  r       record;
begin
  for v_a in
    select * from public.announcements
    where status = 'scheduled' and send_at <= now()
    order by send_at
    for update skip locked
  loop
    v_event := null;
    if v_a.event_id is not null then
      select * into v_event from public.events where id = v_a.event_id;
    end if;
    v_path := case when v_a.event_id is not null then '/confirmar/' || v_a.event_id else '/' end;
    v_count := 0;
    for r in select profile_id from public.announcement_recipients(v_a.id) loop
      perform public.enqueue_notification(
        v_a.church_id, r.profile_id, 'announcement',
        'announcement:' || v_a.id || ':' || r.profile_id,
        jsonb_build_object(
          'title', v_a.title, 'body', v_a.body, 'path', v_path,
          'pushOnly', v_a.channel = 'push',
          'eventTitle', v_event.title, 'eventStartsAt', v_event.starts_at
        )
      );
      v_count := v_count + 1;
    end loop;
    update public.announcements
    set status = 'sent', sent_at = now(), recipients_count = v_count
    where id = v_a.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end;
$$;
-- O app chama logo depois de criar um aviso "agora" (só envia o que já venceu)
revoke execute on function public.dispatch_announcements() from public, anon;
grant execute on function public.dispatch_announcements() to authenticated;

select cron.schedule('idex-central-de-avisos', '* * * * *', 'select public.dispatch_announcements()');
