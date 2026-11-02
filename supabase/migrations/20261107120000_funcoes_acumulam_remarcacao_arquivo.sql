-- =============================================================================
-- 1) Funções que acumulam: quem canta (ministro, vocal, backing…) pode ser
--    escalado também em outra função no mesmo culto. Instrumento continua um
--    por vez: no máximo UMA função "que não acumula" por pessoa em cada evento.
-- 2) Remarcação: events.rescheduled_at guarda quando o dia/horário mudou, para
--    o app mostrar que uma observação foi escrita antes da mudança. O aviso de
--    remarcação também vai para quem respondeu a disponibilidade do culto e
--    leva para /confirmar/<culto> (revisar a disponibilidade).
-- 3) Conversas dos cultos não são mais apagadas 30 dias depois: ficam
--    arquivadas (só leitura) para consultar depois.
-- =============================================================================

-- 1) -------------------------------------------------------------------------
alter table public.ministry_roles
  add column can_combine boolean not null default false;

comment on column public.ministry_roles.can_combine is
  'Pode ser escalado junto com outra função no mesmo evento (ex.: vozes). Instrumento = false.';

-- vozes já cadastradas passam a acumular (mesma regra de isVoiceRole no app)
update public.ministry_roles
set can_combine = true
where name ~* '(voz|vozes|vocal|back|cant|ministr|soprano|contralto|tenor|bar[ií]tono|coral)';

-- Barra duas funções "que não acumulam" para a mesma pessoa no mesmo evento.
-- Sem função (null) não conta.
create or replace function public.schedule_assignment_roles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_exclusive boolean;
  v_other text;
begin
  if new.ministry_role_id is null then
    return new;
  end if;
  -- mesma pessoa duas vezes na mesma função: a unique já barra
  select not r.can_combine into v_new_exclusive
  from public.ministry_roles r where r.id = new.ministry_role_id;
  if not coalesce(v_new_exclusive, false) then
    return new;
  end if;
  select r.name into v_other
  from public.schedule_assignments sa
  join public.ministry_roles r on r.id = sa.ministry_role_id
  where sa.event_id = new.event_id
    and sa.ministry_member_id = new.ministry_member_id
    and sa.id <> new.id
    and sa.ministry_role_id <> new.ministry_role_id
    and not r.can_combine
  limit 1;
  if v_other is not null then
    raise exception 'Esta pessoa já está em % neste evento. Instrumento é um por vez.', v_other
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.schedule_assignment_roles_guard() from public, anon, authenticated;

create trigger schedule_assignments_roles_guard
  before insert or update of event_id, ministry_member_id, ministry_role_id
  on public.schedule_assignments
  for each row execute function public.schedule_assignment_roles_guard();

-- 2) -------------------------------------------------------------------------
alter table public.events add column rescheduled_at timestamptz;

comment on column public.events.rescheduled_at is
  'Última vez que o dia/horário (starts_at) mudou. Observações mais antigas que isso foram escritas antes da remarcação.';

create or replace function public.events_mark_rescheduled()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.rescheduled_at := now();
  else
    -- o cliente não marca sozinho
    new.rescheduled_at := old.rescheduled_at;
  end if;
  return new;
end;
$$;

create trigger events_mark_rescheduled
  before update on public.events
  for each row execute function public.events_mark_rescheduled();

create or replace function public.events_rescheduled_at_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rescheduled_at := null;
  return new;
end;
$$;

create trigger events_rescheduled_at_on_insert
  before insert on public.events
  for each row execute function public.events_rescheduled_at_on_insert();

-- Aviso de remarcação: equipe escalada + (no culto) quem respondeu a
-- disponibilidade dele. Leva para /confirmar/<culto>.
create or replace function public.notify_event_rescheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_service uuid := coalesce(new.service_event_id, new.id);
begin
  if new.starts_at is not distinct from old.starts_at or new.starts_at <= now() then
    return null;
  end if;
  for v_row in
    select distinct mm.user_id
    from public.ministry_members mm
    where mm.status = 'active'
      and (
        mm.id in (
          select sa.ministry_member_id from public.schedule_assignments sa
          where sa.event_id = new.id and sa.status in ('scheduled', 'confirmed')
        )
        or (
          new.kind = 'service'
          and mm.id in (
            select ea.ministry_member_id from public.event_availability ea
            where ea.event_id = new.id
          )
        )
      )
  loop
    perform public.enqueue_notification(
      new.church_id, v_row.user_id, 'event_rescheduled',
      'resched:' || new.id || ':' || v_row.user_id || ':' || extract(epoch from new.starts_at)::bigint,
      jsonb_build_object(
        'eventTitle', new.title, 'eventStartsAt', new.starts_at, 'arriveAt', new.arrive_at,
        'oldStartsAt', old.starts_at, 'kind', new.kind,
        'path', '/confirmar/' || v_service
      )
    );
  end loop;
  return null;
end;
$$;
revoke execute on function public.notify_event_rescheduled() from public, anon, authenticated;

-- 3) -------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'idex-limpar-conversas-de-culto') then
    perform cron.unschedule('idex-limpar-conversas-de-culto');
  end if;
end;
$$;

