-- =============================================================================
-- Justificativa registrada pelo líder + histórico dos avisos
--
--  - O líder pode registrar a justificativa de falta/atraso por um integrante
--    (ex.: estava no hospital e não conseguiu avisar), antes ou depois do
--    evento. Já entra aprovada; se o desconto já caiu, volta como "ajuste"
--    (mesma regra do review_justification). Serve também para desfazer um
--    aviso recusado.
--  - justifications.created_by: quem registrou (o próprio integrante ou o líder).
--  - justification_log: histórico de cada aviso (enviado, aprovado, recusado,
--    cancelado, registrado pelo líder) com quem fez e quando. Fica guardado
--    mesmo se o aviso for apagado.
-- =============================================================================

alter table public.justifications
  add column created_by uuid references public.profiles (id) on delete set null default auth.uid();

comment on column public.justifications.created_by is
  'Quem registrou o aviso: o próprio integrante ou o líder (leader_register_justification).';

update public.justifications j
set created_by = mm.user_id
from public.ministry_members mm
where mm.id = j.ministry_member_id and j.created_by is null;

-- -----------------------------------------------------------------------------
-- Histórico
-- -----------------------------------------------------------------------------
create table public.justification_log (
  id                 uuid primary key default gen_random_uuid(),
  church_id          uuid not null references public.churches (id) on delete cascade,
  justification_id   uuid,
  event_id           uuid references public.events (id) on delete cascade,
  ministry_member_id uuid references public.ministry_members (id) on delete cascade,
  action             text not null check (action in (
                       'created', 'created_by_leader', 'approved', 'rejected',
                       'reopened', 'cancelled', 'reconfirmed', 'edited')),
  kind               public.justification_kind,
  reason             text,
  note               text,
  actor              uuid references public.profiles (id) on delete set null,
  at                 timestamptz not null default now()
);
create index justification_log_member_idx on public.justification_log (ministry_member_id, at desc);
create index justification_log_church_idx on public.justification_log (church_id, at desc);
create index justification_log_just_idx on public.justification_log (justification_id);

comment on table public.justification_log is
  'Histórico dos avisos de falta/atraso (quem fez o quê e quando). Só gatilhos escrevem.';

alter table public.justification_log enable row level security;

create policy justification_log_select on public.justification_log
  for select to authenticated
  using (public.is_self_member(ministry_member_id) or public.is_leader_of_member(ministry_member_id));
-- sem insert/update/delete para o cliente: só o gatilho (security definer) grava

create or replace function public.justifications_write_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_self  boolean;
begin
  if tg_op = 'INSERT' then
    select mm.user_id = coalesce(new.created_by, v_actor) into v_self
    from public.ministry_members mm where mm.id = new.ministry_member_id;
    insert into public.justification_log
      (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, actor)
    values (new.church_id, new.id, new.event_id, new.ministry_member_id,
            case when coalesce(v_self, true) then 'created' else 'created_by_leader' end,
            new.kind, new.reason, coalesce(new.created_by, v_actor));
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.justification_log
      (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, actor)
    select old.church_id, old.id, old.event_id, old.ministry_member_id, 'cancelled',
           old.kind, old.reason, v_actor
    -- apagado em cascata (evento/integrante removido): não registra
    where exists (select 1 from public.events e where e.id = old.event_id)
      and exists (select 1 from public.ministry_members mm where mm.id = old.ministry_member_id);
    return null;
  end if;

  -- UPDATE
  if new.status is distinct from old.status then
    insert into public.justification_log
      (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, note, actor)
    values (new.church_id, new.id, new.event_id, new.ministry_member_id,
            case new.status when 'approved' then 'approved'
                            when 'rejected' then 'rejected'
                            else 'reopened' end,
            new.kind, new.reason, new.review_note, coalesce(new.reviewed_by, v_actor));
  elsif new.kind is distinct from old.kind or new.reason is distinct from old.reason then
    insert into public.justification_log
      (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, actor)
    values (new.church_id, new.id, new.event_id, new.ministry_member_id, 'edited',
            new.kind, new.reason, v_actor);
  elsif new.reconfirmed_at is distinct from old.reconfirmed_at and new.reconfirmed_at is not null then
    insert into public.justification_log
      (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, actor)
    values (new.church_id, new.id, new.event_id, new.ministry_member_id, 'reconfirmed',
            new.kind, new.reason, v_actor);
  end if;
  return null;
end;
$$;

create trigger justifications_log_ins
  after insert on public.justifications
  for each row execute function public.justifications_write_log();
create trigger justifications_log_upd
  after update on public.justifications
  for each row execute function public.justifications_write_log();
create trigger justifications_log_del
  after delete on public.justifications
  for each row execute function public.justifications_write_log();

-- o cliente não escolhe quem registrou
create or replace function public.justifications_set_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger justifications_set_created_by
  before insert on public.justifications
  for each row execute function public.justifications_set_created_by();

-- histórico dos avisos que já existiam (data de envio e análise)
insert into public.justification_log
  (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, actor, at)
select j.church_id, j.id, j.event_id, j.ministry_member_id, 'created', j.kind, j.reason,
       j.created_by, j.created_at
from public.justifications j;
insert into public.justification_log
  (church_id, justification_id, event_id, ministry_member_id, action, kind, reason, note, actor, at)
select j.church_id, j.id, j.event_id, j.ministry_member_id, j.status::text, j.kind, j.reason,
       j.review_note, j.reviewed_by, j.reviewed_at
from public.justifications j
where j.status in ('approved', 'rejected') and j.reviewed_at is not null;

-- -----------------------------------------------------------------------------
-- Líder registra a justificativa por um integrante (já aprovada)
-- -----------------------------------------------------------------------------
create or replace function public.leader_register_justification(
  p_event_id uuid,
  p_ministry_member_id uuid,
  p_kind public.justification_kind,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_just  public.justifications%rowtype;
  v_mm    public.ministry_members%rowtype;
  v_note  text;
begin
  if not public.is_leader_of_member(p_ministry_member_id) then
    raise exception 'Só o líder do ministério registra justificativa por outra pessoa'
      using errcode = '42501';
  end if;
  select * into v_mm from public.ministry_members where id = p_ministry_member_id;
  if v_mm.user_id = auth.uid() then
    raise exception 'Para você mesmo, use "Avisar atraso ou falta"' using errcode = '22023';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.ministry_id <> v_mm.ministry_id then
    raise exception 'Evento não encontrado neste ministério' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Escreva o motivo' using errcode = '22023';
  end if;

  v_note := 'Registrado pelo líder';

  select * into v_just from public.justifications
  where event_id = p_event_id and ministry_member_id = p_ministry_member_id
  for update;

  if not found then
    insert into public.justifications
      (church_id, event_id, ministry_member_id, kind, reason, status, created_by)
    values (v_event.church_id, p_event_id, p_ministry_member_id, p_kind, trim(p_reason),
            'pending', auth.uid())
    returning * into v_just;
  else
    if v_just.status = 'approved' then
      raise exception 'Já existe justificativa aprovada para este evento' using errcode = '22023';
    end if;
    v_note := case when v_just.status = 'rejected'
                   then 'Líder mudou de recusado para aprovado'
                   else 'Aprovado pelo líder' end;
    -- o líder pode corrigir tipo e motivo; o original fica no histórico
    update public.justifications
    set kind = p_kind, reason = trim(p_reason), status = 'pending',
        reviewed_by = null, reviewed_at = null, review_note = null
    where id = v_just.id;
  end if;

  perform public.review_justification(v_just.id, true, v_note);
  return v_just.id;
end;
$$;

revoke execute on function public.leader_register_justification(uuid, uuid, public.justification_kind, text)
  from public, anon;
grant execute on function public.leader_register_justification(uuid, uuid, public.justification_kind, text)
  to authenticated;
