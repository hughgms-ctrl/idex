-- Aviso de presença não registrada e registro completo para o líder.
--
-- Antes: quem esquecia de registrar presença só ficava sabendo quando o prazo
-- do "esqueci" (48 h) já tinha acabado — o aviso "−20 falta sem aviso" chegava
-- junto com a falta, sem chance de pedir o registro.
--
-- Agora `enqueue_missing_checkin_notices` (pg_cron a cada 5 min) avisa, no
-- celular e no WhatsApp, quem está escalado e não tem presença, nem pedido
-- "esqueci", nem aviso de falta (deste evento ou do evento junto):
--   during: depois da chegada + tolerância (+5 min), enquanto o evento não acaba;
--   after:  10 min depois do fim, com o prazo do "esqueci" e o desconto;
--   last:   12 h antes do prazo acabar.
-- Tipo `announcement` (não precisa republicar `notifications-dispatch`);
-- dedupe `checkin_missing:<etapa>:<evento>:<integrante>`.
--
-- `member_presence_trail`: tudo o que aconteceu na presença de um integrante
-- (tentativas, registros, pedidos e esses avisos), para o líder conferir no
-- extrato antes de decidir.

-- Data e hora em pt-BR no fuso da igreja: "domingo, 15/11 às 18h00"
create or replace function public.pt_when(p_at timestamptz, p_tz text default 'America/Sao_Paulo')
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])
           [extract(dow from p_at at time zone p_tz)::int + 1]
         || ', ' || to_char(p_at at time zone p_tz, 'DD/MM') || ' às '
         || to_char(p_at at time zone p_tz, 'HH24"h"MI');
$$;

create or replace function public.enqueue_missing_checkin_notices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row   record;
  v_count integer := 0;
  v_title text;
  v_body  text;
  v_path  text;
  v_first text;
  v_what  text;
begin
  for v_row in
    with base as (
      select distinct on (e.id, sa.ministry_member_id)
             e.id as event_id, e.church_id, e.kind, e.title, e.starts_at,
             coalesce(e.arrive_at, e.starts_at) as call_at,
             public.event_end(e.starts_at, e.ends_at) as end_at,
             public.event_end(e.starts_at, e.ends_at)
               + make_interval(hours => s.checkin_request_deadline_hours) as deadline,
             coalesce(public.tolerance_for_event(e.id), 10) as tolerance,
             s.absence_penalty,
             coalesce(c.timezone, 'America/Sao_Paulo') as tz,
             sa.ministry_member_id, mm.user_id, p.full_name
      from public.events e
      join public.churches c on c.id = e.church_id
      join public.ministry_settings s on s.ministry_id = e.ministry_id
      join public.schedule_assignments sa on sa.event_id = e.id
        and sa.status in ('scheduled', 'confirmed')
      join public.ministry_members mm on mm.id = sa.ministry_member_id and mm.status = 'active'
      join public.profiles p on p.id = mm.user_id
      where e.starts_at > now() - interval '4 days'
        and e.starts_at < now() + interval '1 day'
      order by e.id, sa.ministry_member_id
    )
    select b.*,
           case
             when now() >= b.call_at + make_interval(mins => b.tolerance + 5) and now() < b.end_at
               then 'during'
             when now() >= b.end_at + interval '10 minutes' and now() < b.deadline - interval '12 hours'
               then 'after'
             when now() >= b.deadline - interval '12 hours' and now() < b.deadline
               then 'last'
           end as stage
    from base b
    where not exists (select 1 from public.checkins ch
                      where ch.ministry_member_id = b.ministry_member_id
                        and (ch.event_id = b.event_id or public.events_joint(ch.event_id, b.event_id)))
      and not exists (select 1 from public.checkin_requests r
                      where r.ministry_member_id = b.ministry_member_id
                        and (r.event_id = b.event_id or public.events_joint(r.event_id, b.event_id)))
      -- avisou que vai faltar (pendente ou aprovado): não precisa registrar
      and not exists (select 1 from public.justifications j
                      where j.ministry_member_id = b.ministry_member_id
                        and (j.event_id = b.event_id or public.events_joint(j.event_id, b.event_id))
                        and j.kind = 'absence' and j.status in ('pending', 'approved'))
  loop
    continue when v_row.stage is null;

    v_first := split_part(coalesce(v_row.full_name, ''), ' ', 1);
    v_what := v_row.title || ' (' || public.pt_when(v_row.starts_at, v_row.tz) || ')';

    if v_row.stage = 'during' then
      v_title := 'Você ainda não registrou presença';
      v_body := 'Não há registro seu no ' || v_what || '. Se você já está lá, registre agora pelo app.';
      v_path := '/presenca';
    elsif v_row.stage = 'after' then
      v_title := 'Sua presença não foi registrada';
      v_body := 'Não encontramos seu registro de presença no ' || v_what || '. '
             || 'Se você foi e esqueceu, informe o horário em que chegou até '
             || public.pt_when(v_row.deadline, v_row.tz) || '. '
             || case when v_row.absence_penalty > 0
                  then 'Depois disso conta como falta (−' || v_row.absence_penalty || ' pontos).'
                  else 'Depois disso conta como falta.' end;
      v_path := '/presenca?esqueci=' || v_row.event_id;
    else
      v_title := 'Últimas horas para informar sua presença';
      v_body := 'Ainda não há registro seu no ' || v_what || '. Se você foi, informe o horário até '
             || public.pt_when(v_row.deadline, v_row.tz) || '; '
             || case when v_row.absence_penalty > 0
                  then 'depois disso conta como falta (−' || v_row.absence_penalty || ' pontos).'
                  else 'depois disso conta como falta.' end;
      v_path := '/presenca?esqueci=' || v_row.event_id;
    end if;
    if v_first <> '' and v_row.stage <> 'during' then
      v_body := v_first || ', ' || lower(left(v_body, 1)) || substr(v_body, 2);
    end if;

    perform public.enqueue_notification(
      v_row.church_id, v_row.user_id, 'announcement',
      'checkin_missing:' || v_row.stage || ':' || v_row.event_id || ':' || v_row.ministry_member_id,
      jsonb_build_object('title', v_title, 'body', v_body, 'path', v_path,
                         'eventId', v_row.event_id, 'stage', v_row.stage)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.enqueue_missing_checkin_notices() from public, anon, authenticated;

select cron.schedule('idex-presenca-nao-registrada', '*/5 * * * *',
                     'select public.enqueue_missing_checkin_notices()');

-- -----------------------------------------------------------------------------
-- Registro da presença de um integrante (o próprio ou o líder dele)
-- -----------------------------------------------------------------------------
create or replace function public.member_presence_trail(p_member_id uuid, p_since timestamptz)
returns table (
  event_id   uuid,
  root_id    uuid,
  event_title text,
  at         timestamptz,
  what       text,   -- attempt | checkin | request | notice
  detail     text,   -- resultado / origem / status / etapa
  distance_m numeric,
  minutes    integer,
  delivered  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with ok as (
    select (public.is_self_member(p_member_id) or public.is_leader_of_member(p_member_id)) as allowed
  )
  select a.event_id, coalesce(e.service_event_id, e.id), e.title, a.attempted_at, 'attempt',
         a.outcome, a.distance_m::numeric, null::integer, null::boolean
  from public.checkin_attempts a
  join public.events e on e.id = a.event_id
  where (select allowed from ok) and a.ministry_member_id = p_member_id and e.starts_at >= p_since
  union all
  select c.event_id, coalesce(e.service_event_id, e.id), e.title, c.arrived_at, 'checkin',
         c.source::text, c.distance_m::numeric, c.late_minutes, null
  from public.checkins c
  join public.events e on e.id = c.event_id
  where (select allowed from ok) and c.ministry_member_id = p_member_id and e.starts_at >= p_since
  union all
  select r.event_id, coalesce(e.service_event_id, e.id), e.title, r.created_at, 'request',
         r.status::text, null, null, null
  from public.checkin_requests r
  join public.events e on e.id = r.event_id
  where (select allowed from ok) and r.ministry_member_id = p_member_id and e.starts_at >= p_since
  union all
  select e.id, coalesce(e.service_event_id, e.id), e.title, q.created_at, 'notice',
         split_part(q.dedupe_key, ':', 2), null, null,
         (q.sent_at is not null or q.push_sent_at is not null)
  from public.notification_queue q
  join public.events e on e.id::text = split_part(q.dedupe_key, ':', 3)
  where (select allowed from ok)
    and q.dedupe_key like 'checkin_missing:%:' || p_member_id::text
    and e.starts_at >= p_since
  order by 4;
$$;

revoke all on function public.member_presence_trail(uuid, timestamptz) from public, anon;
grant execute on function public.member_presence_trail(uuid, timestamptz) to authenticated;
