-- =============================================================================
-- Dados fictícios para desenvolvimento local (aplicado por `supabase db reset`).
--
-- 1 igreja, 1 ministério de louvor e 8 membros. Todos com senha "senha123":
--   ana@idex.local      — dona da igreja e líder do louvor (ministra)
--   bruno@idex.local    — violão
--   carla@idex.local    — vocal
--   daniel@idex.local   — bateria
--   elisa@idex.local    — teclado
--   felipe@idex.local   — baixo
--   gabriela@idex.local — vocal
--   hugo@idex.local     — guitarra
-- Convite de exemplo: http://localhost:5173/convite/convite-demo-louvor
-- =============================================================================

-- Usuários (auth.users + auth.identities, como o Supabase Auth cria)
with people (id, email, full_name) as (
  values
    ('11111111-1111-4111-8111-000000000001'::uuid, 'ana@idex.local',      'Ana Souza'),
    ('11111111-1111-4111-8111-000000000002'::uuid, 'bruno@idex.local',    'Bruno Lima'),
    ('11111111-1111-4111-8111-000000000003'::uuid, 'carla@idex.local',    'Carla Mendes'),
    ('11111111-1111-4111-8111-000000000004'::uuid, 'daniel@idex.local',   'Daniel Rocha'),
    ('11111111-1111-4111-8111-000000000005'::uuid, 'elisa@idex.local',    'Elisa Martins'),
    ('11111111-1111-4111-8111-000000000006'::uuid, 'felipe@idex.local',   'Felipe Alves'),
    ('11111111-1111-4111-8111-000000000007'::uuid, 'gabriela@idex.local', 'Gabriela Costa'),
    ('11111111-1111-4111-8111-000000000008'::uuid, 'hugo@idex.local',     'Hugo Pereira')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.email,
  extensions.crypt('senha123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', p.full_name),
  now(), now(), '', '', '', ''
from people p;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@idex.local';

-- Igreja criada pela própria RPC, "logado" como a Ana
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub": "11111111-1111-4111-8111-000000000001", "role": "authenticated", "email": "ana@idex.local"}',
    true
  );
  perform public.create_church('Comunidade da Graça', 'Louvor');
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Demais membros
insert into public.church_members (church_id, user_id, role)
select c.id, u.id, 'member'
from public.churches c, auth.users u
where c.slug = 'comunidade-da-graca'
  and u.email like '%@idex.local'
  and u.email <> 'ana@idex.local';

insert into public.ministry_members (church_id, ministry_id, user_id, role)
select m.church_id, m.id, cm.user_id, 'member'
from public.ministries m
join public.churches c on c.id = m.church_id and c.slug = 'comunidade-da-graca'
join public.church_members cm on cm.church_id = c.id and cm.role = 'member'
where m.name = 'Louvor';

-- Funções de cada um
with roles_by_email (email, role_name) as (
  values
    ('ana@idex.local', 'Ministro'), ('ana@idex.local', 'Vocal'),
    ('bruno@idex.local', 'Violão'),
    ('carla@idex.local', 'Vocal'),
    ('daniel@idex.local', 'Bateria'),
    ('elisa@idex.local', 'Teclado'),
    ('felipe@idex.local', 'Baixo'),
    ('gabriela@idex.local', 'Vocal'), ('gabriela@idex.local', 'Ministro'),
    ('hugo@idex.local', 'Guitarra')
)
insert into public.ministry_member_roles (church_id, ministry_member_id, ministry_role_id)
select mm.church_id, mm.id, r.id
from roles_by_email rbe
join auth.users u on u.email = rbe.email
join public.ministry_members mm on mm.user_id = u.id
join public.ministry_roles r on r.ministry_id = mm.ministry_id and r.name = rbe.role_name;

-- Localização da igreja (fictícia, centro de São Paulo)
update public.churches
set address = 'Rua Exemplo, 100 — São Paulo/SP', lat = -23.55052, lng = -46.633308
where slug = 'comunidade-da-graca';

-- Próximos eventos (domingo 19h e quinta 20h), em horário de Brasília
insert into public.events (church_id, ministry_id, kind, title, starts_at, ends_at, location_name, created_by)
select
  m.church_id, m.id, e.kind::public.event_kind, e.title,
  e.local_start at time zone 'America/Sao_Paulo',
  (e.local_start + interval '2 hours') at time zone 'America/Sao_Paulo',
  'Templo principal', '11111111-1111-4111-8111-000000000001'
from public.ministries m
cross join lateral (
  values
    ('rehearsal', 'Ensaio', date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '10 days 20 hours'),
    ('service', 'Culto de domingo', date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '13 days 19 hours')
) as e(kind, title, local_start)
where m.name = 'Louvor';

-- Culto: equipe chega 30 min antes; o ensaio de quinta é o ensaio desse culto
update public.events set arrive_at = starts_at - interval '30 minutes' where title = 'Culto de domingo';
update public.events r set service_event_id = c.id, title = 'Ensaio · Culto de domingo'
from public.events c
where r.title = 'Ensaio' and c.title = 'Culto de domingo' and c.ministry_id = r.ministry_id;

-- Algumas músicas (cifras curtas, só de exemplo)
insert into public.songs (church_id, ministry_id, title, artist, original_key, bpm, time_signature, chordpro, created_by)
select m.church_id, m.id, s.title, s.artist, s.key, s.bpm, '4/4', s.chordpro, '11111111-1111-4111-8111-000000000001'
from public.ministries m
cross join (
  values
    ('Canção de Exemplo', 'Autor Fictício', 'G', 72,
     E'{title: Canção de Exemplo}\n{key: G}\n[G]Linha de exemplo da [D]letra\n[Em]Outra linha da [C]canção'),
    ('Louvor Inventado', 'Banda Imaginária', 'D', 128,
     E'{title: Louvor Inventado}\n{key: D}\n[D]Primeira [A]linha\n[Bm]Segunda [G]linha'),
    ('Hino de Teste', 'Domínio Público (fictício)', 'C', 90,
     E'{title: Hino de Teste}\n{key: C}\n[C]Estrofe de [F]teste\n[G]Para o [C]seed')
) as s(title, artist, key, bpm, chordpro)
where m.name = 'Louvor';

-- Convite de exemplo (vários usos, 30 dias)
insert into public.invites (church_id, ministry_id, token, role, max_uses, expires_at, created_by)
select m.church_id, m.id, 'convite-demo-louvor', 'member', 50, now() + interval '30 days',
       '11111111-1111-4111-8111-000000000001'
from public.ministries m
where m.name = 'Louvor';
