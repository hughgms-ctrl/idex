-- Arquivar conversas: some da lista principal e volta com mensagem nova.
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

select plan(7);

insert into auth.users (id, email) values
  ('a2900000-0000-4000-8000-000000000001', 'lider@arq.local'),
  ('a2900000-0000-4000-8000-000000000002', 'ana@arq.local'),
  ('a2900000-0000-4000-8000-000000000003', 'fora@arq.local');

select pg_temp.entrar_como('a2900000-0000-4000-8000-000000000001');
select public.create_church('Igreja Arq');
reset role;
select pg_temp.entrar_como('a2900000-0000-4000-8000-000000000003');
select public.create_church('Outra Arq');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja Arq';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'a2900000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'a2900000-0000-4000-8000-000000000002');
insert into ids select 'grupo', id from chat_conversations where kind = 'ministry' and ministry_id = (select v from ids where k = 'louvor');

create function pg_temp.arquivada()
returns boolean
language sql
as $fn$
  select user_archived from public.my_conversations((select v from ids where k = 'church'))
  where id = (select v from ids where k = 'grupo')
$fn$;

select pg_temp.entrar_como('a2900000-0000-4000-8000-000000000002');
select is(pg_temp.arquivada(), false, 'conversa começa na lista principal');
select lives_ok(
  format($$select public.set_conversation_archived(%L, true)$$, (select v from ids where k = 'grupo')),
  'integrante arquiva o grupo');
select is(pg_temp.arquivada(), true, 'arquivada só para ela');
reset role;

select pg_temp.entrar_como('a2900000-0000-4000-8000-000000000001');
select is(pg_temp.arquivada(), false, 'para o líder continua na lista');
insert into chat_messages (church_id, conversation_id, body)
values ((select v from ids where k = 'church'), (select v from ids where k = 'grupo'), 'Ensaio confirmado');
reset role;
-- a mensagem é de "agora"; o arquivamento foi no mesmo instante da transação
update chat_reads set archived_at = archived_at - interval '1 minute'
where conversation_id = (select v from ids where k = 'grupo');

select pg_temp.entrar_como('a2900000-0000-4000-8000-000000000002');
select is(pg_temp.arquivada(), false, 'mensagem nova traz a conversa de volta');
select lives_ok(
  format($$select public.set_conversation_archived(%L, false)$$, (select v from ids where k = 'grupo')),
  'desarquivar funciona');
reset role;

select pg_temp.entrar_como('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  format($$select public.set_conversation_archived(%L, true)$$, (select v from ids where k = 'grupo')),
  '42501', null, 'quem é de fora não arquiva');
reset role;

select * from finish();
rollback;
