-- =============================================================================
-- Período de teste das regras
--
-- Enquanto o ministério se acostuma com o app, o líder liga "Período de teste"
-- (ministry_settings.rules_trial):
-- * ninguém fica de fora da escala por atraso/falta (apply_late_consequence
--   não tira ninguém; process_absences também passa por ela);
-- * os pontos continuam valendo (atraso e falta descontam normalmente);
-- * a presença continua sendo registrada: o botão não some para ninguém.
-- Ao ligar, quem já tinha ficado de fora de um evento que ainda não terminou
-- volta para a escala (e pode registrar presença).
-- =============================================================================

alter table public.ministry_settings
  add column rules_trial boolean not null default false;
grant update (rules_trial) on public.ministry_settings to authenticated;

create or replace function public.is_rules_trial(p_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rules_trial from public.ministry_settings where ministry_id = p_ministry_id), false);
$$;
revoke execute on function public.is_rules_trial(uuid) from public, anon;
grant execute on function public.is_rules_trial(uuid) to authenticated, service_role;

-- A regra que tira da escala continua igual; quem chama passa pela checagem do teste
alter function public.apply_late_consequence(uuid, uuid, text, text)
  rename to apply_late_consequence_rule;

create or replace function public.apply_late_consequence(
  p_event_id           uuid,
  p_ministry_member_id uuid,
  p_scope              text,
  p_reason             text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_scope <> 'none' and public.is_rules_trial(
    (select ministry_id from public.events where id = p_event_id)
  ) then
    return 0; -- período de teste: ninguém fica de fora
  end if;
  return public.apply_late_consequence_rule(p_event_id, p_ministry_member_id, p_scope, p_reason);
end;
$$;
revoke execute on function public.apply_late_consequence(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.apply_late_consequence(uuid, uuid, text, text) to service_role;
revoke execute on function public.apply_late_consequence_rule(uuid, uuid, text, text) from public, anon, authenticated;

-- Ligou o teste: quem ficou de fora de um evento que ainda não terminou volta
create or replace function public.ministry_settings_trial_on()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rules_trial and not old.rules_trial then
    update public.schedule_assignments sa
    set status = 'scheduled', benched_reason = null
    from public.events e
    where e.id = sa.event_id
      and e.ministry_id = new.ministry_id
      and sa.status = 'benched'
      and public.event_end(e.starts_at, e.ends_at) > now();
  end if;
  return null;
end;
$$;
revoke execute on function public.ministry_settings_trial_on() from public, anon, authenticated;
create trigger ministry_settings_trial_on
  after update of rules_trial on public.ministry_settings
  for each row execute function public.ministry_settings_trial_on();
