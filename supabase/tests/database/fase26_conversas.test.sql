-- Fase 26 — conversas: grupo do ministério, conversa do culto e conversa direta.
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

select plan(33);

insert into auth.users (id, email) values
  ('a2600000-0000-4000-8000-000000000001', 'lider@f26.local'),
  ('a2600000-0000-4000-8000-000000000002', 'ana@f26.local'),
  ('a2600000-0000-4000-8000-000000000003', 'beto@f26.local'),
  ('a2600000-0000-4000-8000-000000000004', 'fora@f26.local');
update profiles set full_name = 'Ana Lima' where id = 'a2600000-0000-4000-8000-000000000002';
update profiles set full_name = 'Beto Souza' where id = 'a2600000-0000-4000-8000-000000000003';

select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000001');
select public.create_church('Igreja F26');
reset role;
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000004');
select public.create_church('Outra igreja F26');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F26';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values
  ((select v from ids where k = 'church'), 'a2600000-0000-4000-8000-000000000002'),
  ((select v from ids where k = 'church'), 'a2600000-0000-4000-8000-000000000003');
insert into ministry_members (church_id, ministry_id, user_id) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a2600000-0000-4000-8000-000000000002'),
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a2600000-0000-4000-8000-000000000003');
insert into ids select 'ana', id from ministry_members where user_id = 'a2600000-0000-4000-8000-000000000002';

insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F26', now() + interval '2 days');
insert into ids select 'culto', id from events where title = 'Culto F26';
insert into events (church_id, ministry_id, kind, title, starts_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio F26',
  now() + interval '1 day', (select v from ids where k = 'culto'));
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto longe F26', now() + interval '20 days');
insert into events (church_id, ministry_id, kind, title, starts_at, ends_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto passado F26',
  now() - interval '3 days', now() - interval '3 days' + interval '2 hours');
insert into schedule_assignments (church_id, event_id, ministry_member_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'culto'), (select v from ids where k = 'ana'));

insert into ids select 'grupo', id from chat_conversations where kind = 'ministry' and ministry_id = (select v from ids where k = 'louvor');
insert into ids select 'conv_culto', id from chat_conversations where event_id = (select v from ids where k = 'culto');
insert into ids select 'conv_passado', c.id from chat_conversations c join events e on e.id = c.event_id where e.title = 'Culto passado F26';

-- Conversas criadas pelo sistema
select isnt((select v from ids where k = 'grupo'), null, 'ministério novo já tem o grupo');
select isnt((select v from ids where k = 'conv_culto'), null, 'culto novo já tem a conversa da equipe');
select is(
  (select count(*)::int from chat_conversations c join events e on e.id = c.event_id where e.title = 'Ensaio F26'),
  0, 'ensaio não tem conversa própria (é a do culto)');

-- Quem enxerga o quê
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000002');
select is(public.can_access_conversation((select v from ids where k = 'grupo')), true, 'integrante vê o grupo do ministério');
select is(public.can_access_conversation((select v from ids where k = 'conv_culto')), true, 'escalada vê a conversa do culto');
select is(public.can_access_chat_topic('chat:' || (select v from ids where k = 'grupo')), true, '"digitando…": entra no canal da conversa');
select is(public.can_access_chat_topic('chat:qualquer-coisa'), false, '"digitando…": canal inválido é recusado');
reset role;
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000003');
select is(public.can_access_conversation((select v from ids where k = 'conv_culto')), false, 'quem não está escalado não vê a conversa do culto');
select throws_ok(
  format($$insert into chat_messages (church_id, conversation_id, body) values (%L, %L, 'oi')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'conv_culto')),
  '42501', null, '…nem escreve nela');
reset role;
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000001');
select is(public.can_access_conversation((select v from ids where k = 'conv_culto')), true, 'líder vê a conversa do culto');
reset role;
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000004');
select is(public.can_access_conversation((select v from ids where k = 'grupo')), false, 'pessoa de outra igreja não vê o grupo');
select is((select count(*)::int from chat_conversations where church_id = (select v from ids where k = 'church')), 0,
  'pessoa de outra igreja não lista as conversas');
reset role;

-- Mensagens
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000002');
select lives_ok(
  format($$insert into chat_messages (church_id, conversation_id, body) values (%L, %L, '  Bora ensaiar!  ')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'conv_culto')),
  'escalada escreve na conversa do culto');
select throws_ok(
  format($$insert into chat_messages (church_id, conversation_id, body, sender_id) values (%L, %L, 'fingindo', %L)$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'grupo'), 'a2600000-0000-4000-8000-000000000003'),
  '42501', null, 'não envia em nome de outra pessoa');
select throws_ok(
  format($$insert into chat_messages (church_id, conversation_id, body) values (%L, %L, 'tarde demais')$$,
    (select v from ids where k = 'church'), (select v from ids where k = 'conv_passado')),
  '42501', null, 'conversa de culto arquivada é só leitura');
select throws_ok(
  format($$update chat_reads set muted = true where profile_id = %L$$, 'a2600000-0000-4000-8000-000000000002'),
  '42501', null, 'cliente não grava direto em chat_reads');
reset role;
select is((select body from chat_messages where conversation_id = (select v from ids where k = 'conv_culto')),
  'Bora ensaiar!', 'texto sem espaços sobrando');
select is((select sender_id from chat_messages where conversation_id = (select v from ids where k = 'conv_culto')),
  'a2600000-0000-4000-8000-000000000002'::uuid, 'remetente é quem está logado');

-- Lista: culto daqui a 20 dias ainda não aparece; o passado aparece arquivado
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.my_conversations((select v from ids where k = 'church')) where title = 'Culto longe F26'),
  0, 'conversa do culto só aparece 7 dias antes');
select is(
  (select archived from public.my_conversations((select v from ids where k = 'church')) where title = 'Culto passado F26'),
  true, 'culto que já passou aparece como arquivado');
reset role;

-- Conversa direta
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000003');
select public.open_direct_conversation((select v from ids where k = 'church'), 'a2600000-0000-4000-8000-000000000002');
reset role;
insert into ids select 'direta', id from chat_conversations
where kind = 'direct' and church_id = (select v from ids where k = 'church');
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000003');
select is(
  public.open_direct_conversation((select v from ids where k = 'church'), 'a2600000-0000-4000-8000-000000000002'),
  (select v from ids where k = 'direta'), 'abrir de novo devolve a mesma conversa');
select throws_ok(
  format($$select public.open_direct_conversation(%L, %L)$$,
    (select v from ids where k = 'church'), 'a2600000-0000-4000-8000-000000000004'),
  '22023', null, 'não abre conversa com quem é de outra igreja');
reset role;
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.my_conversations((select v from ids where k = 'church')) where kind = 'direct'),
  0, 'conversa direta vazia não aparece para quem não abriu');
reset role;
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000001');
select is(public.can_access_conversation((select v from ids where k = 'direta')), false, 'líder não lê conversa direta dos outros');
reset role;

-- Avisos no celular: Ana tem push; Beto escreve
insert into push_subscriptions (profile_id, endpoint, p256dh, auth)
values ('a2600000-0000-4000-8000-000000000002', 'https://push.example/f26', 'k', 'a');
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000003');
insert into chat_messages (church_id, conversation_id, body)
values ((select v from ids where k = 'church'), (select v from ids where k = 'direta'), 'Segredo');
insert into chat_messages (church_id, conversation_id, body)
values ((select v from ids where k = 'church'), (select v from ids where k = 'direta'), 'Mais uma');
reset role;
select is(
  (select count(*)::int from notification_queue where profile_id = 'a2600000-0000-4000-8000-000000000002' and dedupe_key like 'chat:%'),
  1, 'várias mensagens seguidas = um aviso só');
select is(
  (select payload ->> 'body' from notification_queue where profile_id = 'a2600000-0000-4000-8000-000000000002' and dedupe_key like 'chat:%'),
  'Nova mensagem', 'aviso de conversa direta não leva o texto para a fila');
select is(
  (select payload ->> 'path' from notification_queue where profile_id = 'a2600000-0000-4000-8000-000000000002' and dedupe_key like 'chat:%'),
  '/conversas/' || (select v from ids where k = 'direta'), 'aviso abre a conversa');

select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000002');
select is(
  (select unread from public.my_conversations((select v from ids where k = 'church')) where kind = 'direct'),
  2, 'duas mensagens sem ler');
select public.mark_conversation_read((select v from ids where k = 'direta'));
select is(
  (select unread from public.my_conversations((select v from ids where k = 'church')) where kind = 'direct'),
  0, 'depois de abrir, nada sem ler');
select public.set_conversation_muted((select v from ids where k = 'grupo'), true);
select throws_ok(
  format($$select public.delete_chat_message(%L)$$,
    (select id from chat_messages where body = 'Segredo')),
  '42501', null, 'não apaga mensagem dos outros');
reset role;

-- Silenciado: não recebe aviso do grupo
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000003');
insert into chat_messages (church_id, conversation_id, body)
values ((select v from ids where k = 'church'), (select v from ids where k = 'grupo'), 'Oi grupo');
reset role;
select is(
  (select count(*)::int from notification_queue where dedupe_key like 'chat:%' and payload ->> 'path' like '%' || (select v from ids where k = 'grupo')),
  0, 'grupo silenciado não avisa');

-- Líder apaga mensagem do grupo; quem recusou a escala sai da conversa do culto
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000001');
select public.delete_chat_message((select id from chat_messages where body = 'Oi grupo'));
reset role;
select is((select deleted_at is not null and body = '' from chat_messages where conversation_id = (select v from ids where k = 'grupo')),
  true, 'líder apaga mensagem do grupo (texto some)');
update schedule_assignments set status = 'declined' where ministry_member_id = (select v from ids where k = 'ana');
select pg_temp.entrar_como('a2600000-0000-4000-8000-000000000002');
select is(public.can_access_conversation((select v from ids where k = 'conv_culto')), false, 'quem recusou a escala sai da conversa do culto');
reset role;

select finish();
rollback;
