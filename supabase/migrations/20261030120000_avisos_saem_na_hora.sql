-- Avisos "agora" e aviso de teste saem na hora: além de pôr na fila, chamam o
-- envio (notifications-dispatch) em vez de esperar o pg_cron do minuto seguinte.
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
  if v_total > 0 then
    perform public.dispatch_notifications_http();
  end if;
  return v_total;
end;
$$;

create or replace function public.send_test_push()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_church uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta' using errcode = '42501';
  end if;
  if not exists (select 1 from public.push_subscriptions where profile_id = v_uid) then
    return false;
  end if;
  select church_id into v_church from public.church_members where user_id = v_uid limit 1;
  if v_church is null then
    return false;
  end if;
  perform public.enqueue_notification(
    v_church, v_uid, 'announcement',
    'test:' || v_uid || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
    jsonb_build_object(
      'title', 'Teste do ide.x',
      'body', 'Se você está vendo isto, os avisos estão funcionando neste aparelho.',
      'path', '/instalar',
      'pushOnly', true
    )
  );
  perform public.dispatch_notifications_http();
  return true;
end;
$$;
