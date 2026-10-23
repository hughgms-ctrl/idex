-- =============================================================================
-- ide.x — RPCs (create_church, accept_invite, get_invite_preview) e gatilhos
-- de domínio (padrões do ministério, crédito inicial do ciclo, auditoria).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ministério novo: configurações padrão, regras do trimestre, funções padrão
-- (para louvor) e o primeiro ciclo aberto.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_ministry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_start  date;
  v_months integer;
begin
  insert into public.ministry_settings (ministry_id, church_id)
  values (new.id, new.church_id)
  on conflict (ministry_id) do nothing;

  insert into public.quarter_plan_rules (ministry_id, church_id)
  values (new.id, new.church_id)
  on conflict (ministry_id) do nothing;

  if new.kind = 'worship' then
    insert into public.ministry_roles (church_id, ministry_id, name, sort_order)
    select new.church_id, new.id, r.name, r.ord
    from unnest(array['Ministro', 'Vocal', 'Violão', 'Guitarra', 'Baixo', 'Teclado', 'Bateria'])
      with ordinality as r(name, ord)
    on conflict (ministry_id, name) do nothing;
  end if;

  select c.timezone into v_tz from public.churches c where c.id = new.church_id;
  select s.cycle_months into v_months from public.ministry_settings s where s.ministry_id = new.id;
  v_start := (now() at time zone coalesce(v_tz, 'America/Sao_Paulo'))::date;

  insert into public.cycles (church_id, ministry_id, starts_on, ends_on, status)
  values (
    new.church_id,
    new.id,
    v_start,
    (v_start + make_interval(months => v_months) - interval '1 day')::date,
    'open'
  );

  return new;
end;
$$;

create trigger on_ministry_created
  after insert on public.ministries
  for each row execute function public.handle_new_ministry();

-- -----------------------------------------------------------------------------
-- Membro novo no ministério: quem entra no meio do ciclo começa com saldo
-- cheio (crédito "cycle_start" no ledger do ciclo aberto).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_ministry_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle_id uuid;
  v_points   integer;
begin
  select c.id into v_cycle_id
  from public.cycles c
  where c.ministry_id = new.ministry_id and c.status = 'open';

  if v_cycle_id is null then
    return new;
  end if;

  select s.cycle_starting_points into v_points
  from public.ministry_settings s
  where s.ministry_id = new.ministry_id;

  if not exists (
    select 1 from public.point_ledger pl
    where pl.cycle_id = v_cycle_id
      and pl.ministry_member_id = new.id
      and pl.reason = 'cycle_start'
  ) then
    insert into public.point_ledger
      (church_id, ministry_id, cycle_id, ministry_member_id, delta, reason, note)
    values
      (new.church_id, new.ministry_id, v_cycle_id, new.id, coalesce(v_points, 100), 'cycle_start',
       'Saldo inicial do ciclo');
  end if;

  return new;
end;
$$;

create trigger on_ministry_member_created
  after insert on public.ministry_members
  for each row execute function public.handle_new_ministry_member();

-- -----------------------------------------------------------------------------
-- Auditoria genérica
-- -----------------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       jsonb;
  v_church_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_church_id := case when tg_table_name = 'churches'
                      then (v_row ->> 'id')::uuid
                      else (v_row ->> 'church_id')::uuid end;

  -- Igreja sendo apagada (cascata): não há onde registrar.
  if not exists (select 1 from public.churches c where c.id = v_church_id) then
    return null;
  end if;

  insert into public.audit_log (church_id, actor_id, action, table_name, record_id, data)
  values (
    v_church_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'ministry_id'),
    v_row - 'token' -- nunca guardar o token de convite no log
  );
  return null;
end;
$$;

create trigger audit_churches after insert or update or delete on public.churches
  for each row execute function public.audit_trigger();
create trigger audit_church_members after insert or update or delete on public.church_members
  for each row execute function public.audit_trigger();
create trigger audit_ministries after insert or update or delete on public.ministries
  for each row execute function public.audit_trigger();
create trigger audit_ministry_members after insert or update or delete on public.ministry_members
  for each row execute function public.audit_trigger();
create trigger audit_ministry_settings after update on public.ministry_settings
  for each row execute function public.audit_trigger();
create trigger audit_invites after insert or update or delete on public.invites
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- slug a partir do nome (sem acentos, minúsculo, com hífens)
-- -----------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(
      coalesce(p_text, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
    )),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- -----------------------------------------------------------------------------
-- RPC: create_church
-- Cria a igreja, torna o usuário logado "owner", cria o ministério de louvor
-- (com configurações padrão e primeiro ciclo) e o coloca como líder.
-- -----------------------------------------------------------------------------
create or replace function public.create_church(
  p_church_name   text,
  p_ministry_name text default 'Louvor',
  p_full_name     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_church_id   uuid;
  v_ministry_id uuid;
  v_base_slug   text;
  v_slug        text;
  v_name        text := trim(coalesce(p_church_name, ''));
begin
  if v_uid is null then
    raise exception 'É preciso estar logado para cadastrar a igreja' using errcode = '28000';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Nome da igreja deve ter entre 2 e 120 caracteres' using errcode = '22023';
  end if;

  if p_full_name is not null and length(trim(p_full_name)) > 0 then
    update public.profiles set full_name = left(trim(p_full_name), 120) where id = v_uid;
  end if;

  v_base_slug := coalesce(nullif(public.slugify(v_name), ''), 'igreja');
  v_slug := v_base_slug;
  while exists (select 1 from public.churches c where c.slug = v_slug) loop
    v_slug := v_base_slug || '-' || substr(md5(random()::text), 1, 5);
  end loop;

  insert into public.churches (name, slug, created_by)
  values (v_name, v_slug, v_uid)
  returning id into v_church_id;

  insert into public.church_members (church_id, user_id, role)
  values (v_church_id, v_uid, 'owner');

  insert into public.ministries (church_id, name, kind)
  values (v_church_id, coalesce(nullif(trim(p_ministry_name), ''), 'Louvor'), 'worship')
  returning id into v_ministry_id;

  -- líderes também batem ponto: o dono entra no ministério como líder
  insert into public.ministry_members (church_id, ministry_id, user_id, role)
  values (v_church_id, v_ministry_id, v_uid, 'leader');

  return v_church_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: get_invite_preview — usado pela tela pública de convite (anon)
-- -----------------------------------------------------------------------------
create or replace function public.get_invite_preview(p_token text)
returns table (
  church_name   text,
  ministry_name text,
  role          public.ministry_member_role,
  expires_at    timestamptz,
  status        text -- valid | expired | revoked | used | not_found
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
    return query select null::text, null::text, null::public.ministry_member_role, null::timestamptz, 'not_found'::text;
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
    end;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: accept_invite — o usuário logado entra na igreja e no ministério
-- -----------------------------------------------------------------------------
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
      'already_member', true
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
    'already_member', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões das RPCs
-- -----------------------------------------------------------------------------
revoke execute on function
  public.handle_new_ministry(),
  public.handle_new_ministry_member(),
  public.audit_trigger(),
  public.slugify(text),
  public.create_church(text, text, text),
  public.get_invite_preview(text),
  public.accept_invite(text, text)
from public, anon;

grant execute on function public.create_church(text, text, text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
grant execute on function public.slugify(text) to authenticated;
