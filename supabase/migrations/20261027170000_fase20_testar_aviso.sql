-- Fase 20 — "Enviar aviso de teste": a pessoa manda um aviso para os próprios
-- aparelhos (só celular/navegador, nunca WhatsApp). No máximo um por minuto.
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
  return true;
end;
$$;
revoke execute on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
