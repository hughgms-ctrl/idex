-- Fase 6 — fila de avisos por WhatsApp.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create function pg_temp.entrar_como(p_uid uuid)
returns void
language plpgsql
as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$fn$;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a6000000-0000-4000-8000-000000000001', 'lider@f6.local', '{"full_name": "Líder Seis"}'),
  ('a6000000-0000-4000-8000-000000000002', 'com.fone@f6.local', '{"full_name": "Com Fone"}'),
  ('a6000000-0000-4000-8000-000000000003', 'sem.aviso@f6.local', '{"full_name": "Sem Aviso"}');
update profiles set phone = '(11) 91234-5678' where id in ('a6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000003');
update profiles set whatsapp_opt_out = true where id = 'a6000000-0000-4000-8000-000000000003';

select pg_temp.entrar_como('a6000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F6');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated, service_role;
insert into ids select 'church', id from churches where name = 'Igreja F6';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array['a6000000-0000-4000-8000-000000000002'::uuid, 'a6000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array['a6000000-0000-4000-8000-000000000002'::uuid, 'a6000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ids select 'm_fone', id from ministry_members where user_id = 'a6000000-0000-4000-8000-000000000002';
insert into ids select 'm_off', id from ministry_members where user_id = 'a6000000-0000-4000-8000-000000000003';

-- Culto daqui a 2 dias (19h em SP) com os dois escalados
insert into events (church_id, ministry_id, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Culto F6',
        ((now() at time zone 'America/Sao_Paulo')::date + 2 + time '19:00') at time zone 'America/Sao_Paulo');
insert into ids select 'evento', id from events where title = 'Culto F6';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'evento'), v from ids where k in ('m_fone', 'm_off');

-- -----------------------------------------------------------------------------
-- Lembrete D-2
-- -----------------------------------------------------------------------------
set local role service_role;
select lives_ok('select public.enqueue_reminders()', 'job de lembretes roda');
reset role;
select is((select count(*)::int from notification_queue where kind = 'schedule_reminder' and church_id = (select v from ids where k = 'church')), 2,
  'um lembrete por escalado');
select is((select status::text from notification_queue where kind = 'schedule_reminder' and profile_id = 'a6000000-0000-4000-8000-000000000002'), 'pending',
  'quem tem telefone fica na fila');
select is((select status::text from notification_queue where kind = 'schedule_reminder' and profile_id = 'a6000000-0000-4000-8000-000000000003'), 'skipped',
  'quem optou por não receber é pulado');
set local role service_role;
select public.enqueue_reminders();
reset role;
select is((select count(*)::int from notification_queue where kind = 'schedule_reminder' and church_id = (select v from ids where k = 'church')), 2,
  'rodar de novo não duplica');

-- -----------------------------------------------------------------------------
-- Ponto descontado e pedido analisado
-- -----------------------------------------------------------------------------
set local role service_role;
select public.record_attendance((select v from ids where k = 'evento'), (select v from ids where k = 'm_fone'), now(), 25, -10, 'qr');
reset role;
select is((select (payload ->> 'delta')::int from notification_queue where kind = 'points_deducted' and profile_id = 'a6000000-0000-4000-8000-000000000002'), -10,
  'desconto gera aviso com o valor');
select is((select (payload ->> 'balance')::int from notification_queue where kind = 'points_deducted' and profile_id = 'a6000000-0000-4000-8000-000000000002'), 90,
  'aviso traz o saldo depois do desconto');

insert into justifications (church_id, event_id, ministry_member_id, kind, reason)
values ((select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'm_fone'), 'late', 'Trânsito');
select pg_temp.entrar_como('a6000000-0000-4000-8000-000000000001');
select public.review_justification((select id from justifications where reason = 'Trânsito' and ministry_member_id = (select v from ids where k = 'm_fone')), true);
reset role;
select is((select payload ->> 'status' from notification_queue where kind = 'request_reviewed' and profile_id = 'a6000000-0000-4000-8000-000000000002'), 'approved',
  'justificativa aprovada gera aviso');

-- -----------------------------------------------------------------------------
-- Envio (service_role) e permissões
-- -----------------------------------------------------------------------------
set local role service_role;
create temporary table claimed on commit drop as select * from public.claim_notifications(100);
select ok((select count(*) from claimed where phone = '(11) 91234-5678') >= 3, 'servidor pega os pendentes com o telefone');
select public.finish_notification((select id from claimed where kind = 'schedule_reminder' and phone is not null limit 1), true);
select public.finish_notification((select id from claimed where kind = 'points_deducted' limit 1), false, 'HTTP 500', now() + interval '5 minutes');
reset role;
select is((select status::text from notification_queue where kind = 'schedule_reminder' and profile_id = 'a6000000-0000-4000-8000-000000000002'), 'sent',
  'enviado com sucesso');
select is((select status::text || '/' || attempts from notification_queue where kind = 'points_deducted' and profile_id = 'a6000000-0000-4000-8000-000000000002'), 'pending/1',
  'falha volta para a fila com nova tentativa');

select pg_temp.entrar_como('a6000000-0000-4000-8000-000000000002');
select is((select count(*)::int from notification_queue where profile_id <> 'a6000000-0000-4000-8000-000000000002'), 0, 'membro só vê os próprios avisos');
select throws_ok(
  format('insert into notification_queue (church_id, profile_id, kind, dedupe_key) values (%L, %L, %L, %L)',
    (select v from ids where k = 'church'), 'a6000000-0000-4000-8000-000000000002', 'points_deducted', 'x'),
  '42501', null, 'membro não escreve na fila');
select throws_ok('select public.claim_notifications(10)', '42501', null, 'membro não dispara envios');
reset role;

select * from finish();
rollback;
