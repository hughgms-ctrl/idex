-- =============================================================================
-- Apoio do ministério (ex.: quem cuida do som ou do data show)
--
-- Pessoas que só CONSULTAM o ministério: horários dos cultos e ensaios, quem
-- toca o quê, setlist e cifras no tom do culto. Não são integrantes: não
-- entram em `ministry_members` (sem pontos, escala, disponibilidade, presença,
-- conversas nem lembretes). O rótulo ("Som", "Data show"…) é escrito pelo líder.
--
-- Entram por convite (`invites.kind = 'support'`): viram `church_members`
-- (member) e ganham a linha em `ministry_supporters`. Ao tirar o apoio, quem não
-- tem mais nada na igreja sai também de `church_members` (perde o acesso).
-- =============================================================================

create table public.ministry_supporters (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  ministry_id uuid not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  label       text not null check (length(trim(label)) between 1 and 40),
  created_at  timestamptz not null default now(),
  foreign key (ministry_id, church_id) references public.ministries (id, church_id) on delete cascade,
  unique (ministry_id, user_id)
);
create index ministry_supporters_user_idx on public.ministry_supporters (user_id);
create index ministry_supporters_church_idx on public.ministry_supporters (church_id);

alter table public.ministry_supporters enable row level security;

-- a própria pessoa e o líder do ministério
create policy ministry_supporters_select on public.ministry_supporters
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_ministry_leader(ministry_id));
create policy ministry_supporters_update on public.ministry_supporters
  for update to authenticated
  using (public.is_ministry_leader(ministry_id)) with check (public.is_ministry_leader(ministry_id));

revoke insert, update, delete on public.ministry_supporters from authenticated;
grant select on public.ministry_supporters to authenticated;
grant update (label) on public.ministry_supporters to authenticated;

-- Convite de apoio
alter table public.invites
  add column kind text not null default 'member' check (kind in ('member', 'support')),
  add column support_label text check (support_label is null or length(trim(support_label)) between 1 and 40),
  add constraint invites_support_check check (
    kind = 'member' or (support_label is not null and role = 'member' and ministry_role_ids = '{}')
  );

-- Prévia do convite: diz se é de apoio (o tipo de retorno mudou)
drop function public.get_invite_preview(text);
create or replace function public.get_invite_preview(p_token text)
returns table (
  church_name   text,
  ministry_name text,
  role          public.ministry_member_role,
  expires_at    timestamptz,
  status        text, -- valid | expired | revoked | used | not_found
  kind          text,
  support_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv record;
begin
  select i.*, c.name as c_name, m.name as m_name
  into v_inv
  from public.invites i
  join public.churches c on c.id = i.church_id
  join public.ministries m on m.id = i.ministry_id
  where i.token = p_token;

  if not found then
    return query select null::text, null::text, null::public.ministry_member_role,
      null::timestamptz, 'not_found'::text, null::text, null::text;
    return;
  end if;

  return query select
    v_inv.c_name,
    v_inv.m_name,
    v_inv.role,
    v_inv.expires_at,
    case
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.expires_at <= now() then 'expired'
      when v_inv.uses_count >= v_inv.max_uses then 'used'
      else 'valid'
    end,
    v_inv.kind,
    v_inv.support_label;
end;
$$;
revoke execute on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

create or replace function public.accept_invite(
  p_token     text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_inv       public.invites%rowtype;
  v_member_id uuid;
  v_existing  public.ministry_members%rowtype;
begin
  if v_uid is null then
    raise exception 'É preciso estar logado para aceitar o convite' using errcode = '28000';
  end if;

  select * into v_inv from public.invites i where i.token = p_token for update;

  if not found then
    raise exception 'Convite não encontrado' using errcode = 'P0002';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'Este convite foi cancelado' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'Este convite expirou' using errcode = '22023';
  end if;
  if v_inv.email is not null
     and lower(v_inv.email) <> lower(coalesce(auth.email(), '')) then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = '42501';
  end if;

  select * into v_existing
  from public.ministry_members mm
  where mm.ministry_id = v_inv.ministry_id and mm.user_id = v_uid;

  if found then
    -- Já faz parte: não consome o convite; só promove se o convite for de líder.
    if v_inv.role = 'leader' and v_existing.role <> 'leader' then
      update public.ministry_members set role = 'leader' where id = v_existing.id;
    end if;
    return jsonb_build_object(
      'church_id', v_inv.church_id,
      'ministry_id', v_inv.ministry_id,
      'ministry_member_id', v_existing.id,
      'already_member', true,
      'kind', 'member'
    );
  end if;

  if v_inv.kind = 'support' and exists (
    select 1 from public.ministry_supporters s
    where s.ministry_id = v_inv.ministry_id and s.user_id = v_uid
  ) then
    return jsonb_build_object(
      'church_id', v_inv.church_id,
      'ministry_id', v_inv.ministry_id,
      'already_member', true,
      'kind', 'support'
    );
  end if;

  if v_inv.uses_count >= v_inv.max_uses then
    raise exception 'Este convite já foi usado' using errcode = '22023';
  end if;

  if p_full_name is not null and length(trim(p_full_name)) > 0 then
    update public.profiles set full_name = left(trim(p_full_name), 120) where id = v_uid;
  end if;

  insert into public.church_members (church_id, user_id, role)
  values (v_inv.church_id, v_uid, 'member')
  on conflict (church_id, user_id) do nothing;

  if v_inv.kind = 'support' then
    insert into public.ministry_supporters (church_id, ministry_id, user_id, label)
    values (v_inv.church_id, v_inv.ministry_id, v_uid, trim(v_inv.support_label));
    update public.invites set uses_count = uses_count + 1 where id = v_inv.id;
    return jsonb_build_object(
      'church_id', v_inv.church_id,
      'ministry_id', v_inv.ministry_id,
      'already_member', false,
      'kind', 'support'
    );
  end if;

  insert into public.ministry_members (church_id, ministry_id, user_id, role)
  values (v_inv.church_id, v_inv.ministry_id, v_uid, v_inv.role)
  returning id into v_member_id;

  insert into public.ministry_member_roles (church_id, ministry_member_id, ministry_role_id)
  select v_inv.church_id, v_member_id, r.id
  from public.ministry_roles r
  where r.id = any (v_inv.ministry_role_ids) and r.ministry_id = v_inv.ministry_id
  on conflict do nothing;

  update public.invites set uses_count = uses_count + 1 where id = v_inv.id;

  return jsonb_build_object(
    'church_id', v_inv.church_id,
    'ministry_id', v_inv.ministry_id,
    'ministry_member_id', v_member_id,
    'already_member', false,
    'kind', 'member'
  );
end;
$$;

-- Tirar o apoio (só líder). Quem não tem mais nada na igreja sai dela.
create or replace function public.remove_supporter(p_supporter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ministry_supporters%rowtype;
begin
  select * into v_row from public.ministry_supporters where id = p_supporter_id;
  if not found then
    raise exception 'Apoio não encontrado' using errcode = 'P0002';
  end if;
  if not public.is_ministry_leader(v_row.ministry_id) then
    raise exception 'Só o líder do ministério pode tirar o apoio' using errcode = '42501';
  end if;

  delete from public.ministry_supporters where id = v_row.id;

  delete from public.church_members cm
  where cm.church_id = v_row.church_id
    and cm.user_id = v_row.user_id
    and cm.role = 'member'
    and not exists (
      select 1 from public.ministry_members mm
      where mm.church_id = v_row.church_id and mm.user_id = v_row.user_id
    )
    and not exists (
      select 1 from public.ministry_supporters s
      where s.church_id = v_row.church_id and s.user_id = v_row.user_id
    );
end;
$$;
revoke execute on function public.remove_supporter(uuid) from public, anon;
grant execute on function public.remove_supporter(uuid) to authenticated;

-- Só apoio na igreja? (sem ministério e não é dono)
create or replace function public.is_support_only(p_church_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ministry_supporters s
    where s.church_id = p_church_id and s.user_id = p_user_id
  ) and not exists (
    select 1 from public.ministry_members mm
    where mm.church_id = p_church_id and mm.user_id = p_user_id
  ) and not exists (
    select 1 from public.church_members cm
    where cm.church_id = p_church_id and cm.user_id = p_user_id and cm.role = 'owner'
  );
$$;
revoke execute on function public.is_support_only(uuid, uuid) from public, anon;
grant execute on function public.is_support_only(uuid, uuid) to authenticated;

-- Conversas: quem é só apoio não tem conversas (nem recebe mensagem direta)
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
  if public.is_support_only(p_church_id, v_uid) or public.is_support_only(p_church_id, p_profile_id) then
    raise exception 'Quem é apoio não usa as conversas' using errcode = '22023';
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
