-- Fase 3 — setlist: líder ou ministro escalado editam; demais só leem.
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
  ('e0000000-0000-4000-8000-000000000001', 'lider@f3.local'),
  ('e0000000-0000-4000-8000-000000000002', 'ministra@f3.local'),
  ('e0000000-0000-4000-8000-000000000003', 'baixo@f3.local');

select pg_temp.entrar_como('e0000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F3');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F3';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into ministries (church_id, name, kind) values ((select v from ids where k = 'church'), 'Coral', 'worship');
insert into ids select 'coral', id from ministries where name = 'Coral' and church_id = (select v from ids where k = 'church');

insert into church_members (church_id, user_id)
select (select v from ids where k = 'church'), u from unnest(array[
  'e0000000-0000-4000-8000-000000000002'::uuid, 'e0000000-0000-4000-8000-000000000003'::uuid]) u;
insert into ministry_members (church_id, ministry_id, user_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'louvor'), u from unnest(array[
  'e0000000-0000-4000-8000-000000000002'::uuid, 'e0000000-0000-4000-8000-000000000003'::uuid]) u;

insert into events (church_id, ministry_id, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Culto F3', now() + interval '2 days');
insert into ids select 'evento', id from events where title = 'Culto F3';

-- Ministra escalada como Ministro; baixista como Baixo
insert into schedule_assignments (church_id, event_id, ministry_member_id, ministry_role_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'evento'), mm.id, r.id
from ministry_members mm
join ministry_roles r on r.ministry_id = mm.ministry_id
where (mm.user_id = 'e0000000-0000-4000-8000-000000000002' and r.name = 'Ministro')
   or (mm.user_id = 'e0000000-0000-4000-8000-000000000003' and r.name = 'Baixo');

insert into songs (church_id, ministry_id, title) values
  ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'Música do Louvor'),
  ((select v from ids where k = 'church'), (select v from ids where k = 'coral'), 'Música do Coral');
insert into ids select 'song_louvor', id from songs where title = 'Música do Louvor';
insert into ids select 'song_coral', id from songs where title = 'Música do Coral';

-- Baixista (escalado, mas não ministro) não monta setlist
select pg_temp.entrar_como('e0000000-0000-4000-8000-000000000003');
select throws_ok(
  format('insert into setlists (church_id, event_id) values (%L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento')),
  '42501', null, 'integrante comum não cria setlist');
reset role;

-- Ministra monta o setlist e escolhe o tom
select pg_temp.entrar_como('e0000000-0000-4000-8000-000000000002');
select ok(public.is_event_minister((select v from ids where k = 'evento')), 'ministra escalada é reconhecida');
select lives_ok(
  format('insert into setlists (church_id, event_id) values (%L, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento')),
  'ministra escalada cria o setlist');
select lives_ok(
  format('insert into setlist_items (church_id, setlist_id, song_id, position, key) values (%L, (select id from setlists where event_id = %L), %L, 0, %L)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'song_louvor'), 'A'),
  'ministra adiciona música com o tom do culto');
select throws_ok(
  format('insert into setlist_items (church_id, setlist_id, song_id, position) values (%L, (select id from setlists where event_id = %L), %L, 1)',
    (select v from ids where k = 'church'), (select v from ids where k = 'evento'), (select v from ids where k = 'song_coral')),
  '22023', 'A música não é do repertório deste ministério', 'música de outro ministério é recusada');
reset role;

-- Baixista lê o setlist mas não altera o tom
select pg_temp.entrar_como('e0000000-0000-4000-8000-000000000003');
select is((select key from setlist_items limit 1), 'A', 'integrante vê o tom definido');
select results_eq(
  'with u as (update setlist_items set key = ''C'' returning 1) select count(*)::int from u',
  array[0], 'integrante não muda o tom');
reset role;

select * from finish();
rollback;
