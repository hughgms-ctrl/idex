-- Fase 13 — remarcar ensaio avisa a equipe.
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

select plan(4);

insert into auth.users (id, email) values
  ('ad000000-0000-4000-8000-000000000001', 'lider@f13.local'),
  ('ad000000-0000-4000-8000-000000000002', 'membro@f13.local');
update profiles set phone = '(11) 90000-0000' where id = 'ad000000-0000-4000-8000-000000000002';

select pg_temp.entrar_como('ad000000-0000-4000-8000-000000000001');
select public.create_church('Igreja F13');
reset role;

create temporary table ids (k text primary key, v uuid) on commit drop;
grant select on ids to authenticated;
insert into ids select 'church', id from churches where name = 'Igreja F13';
insert into ids select 'louvor', id from ministries where church_id = (select v from ids where k = 'church');
insert into church_members (church_id, user_id) values ((select v from ids where k = 'church'), 'ad000000-0000-4000-8000-000000000002');
insert into ministry_members (church_id, ministry_id, user_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'ad000000-0000-4000-8000-000000000002');
insert into events (church_id, ministry_id, kind, title, starts_at)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'service', 'Culto F13', now() + interval '6 days');
insert into ids select 'culto', id from events where title = 'Culto F13';
insert into events (church_id, ministry_id, kind, title, starts_at, arrive_at, service_event_id)
values ((select v from ids where k = 'church'), (select v from ids where k = 'louvor'), 'rehearsal', 'Ensaio F13',
        now() + interval '3 days', now() + interval '3 days' - interval '20 minutes', (select v from ids where k = 'culto'));
insert into ids select 'ensaio', id from events where title = 'Ensaio F13';
insert into schedule_assignments (church_id, event_id, ministry_member_id)
select (select v from ids where k = 'church'), (select v from ids where k = 'culto'), id from ministry_members
where user_id = 'ad000000-0000-4000-8000-000000000002';

-- Líder remarca o ensaio para o dia seguinte, 1h mais tarde (chegada junto)
select pg_temp.entrar_como('ad000000-0000-4000-8000-000000000001');
select lives_ok(
  format($$update events set starts_at = starts_at + interval '1 day 1 hour', arrive_at = arrive_at + interval '1 day 1 hour' where id = %L$$,
    (select v from ids where k = 'ensaio')),
  'líder remarca o ensaio (dia e horário)');
reset role;
select is((select count(*)::int from notification_queue where kind = 'event_rescheduled'
           and profile_id = 'ad000000-0000-4000-8000-000000000002'), 1, 'quem está na escala é avisado');
select is((select payload ->> 'kind' from notification_queue where kind = 'event_rescheduled' limit 1), 'rehearsal',
  'o aviso diz que é ensaio');

-- Integrante não remarca
select pg_temp.entrar_como('ad000000-0000-4000-8000-000000000002');
update events set starts_at = starts_at + interval '1 hour' where id = (select v from ids where k = 'ensaio');
reset role;
select is((select count(*)::int from notification_queue where kind = 'event_rescheduled'), 1, 'integrante não consegue remarcar');

select * from finish();
rollback;
