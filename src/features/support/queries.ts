import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

// Apoio (som, data show…): só leitura dos cultos do ministério.
export const supportKeys = {
  agenda: (ministryId: string) => ['support', 'agenda', ministryId] as const,
  event: (eventId: string) => ['support', 'event', eventId] as const,
  list: (ministryId: string) => ['support', 'list', ministryId] as const,
}

const SERVICE_COLS =
  'id, title, starts_at, arrive_at, soundcheck_at, ends_at, location_name, notes, setlists(id, setlist_items(count))'

const TEAM_COLS =
  'id, event_id, status, ministry_role_id, ministry_roles(name, sort_order), ministry_members(profiles(full_name))'

const REHEARSAL_COLS =
  'id, title, starts_at, arrive_at, ends_at, service_event_id, rehearsal_groups(name)'

/** Próximos cultos com ensaios e a equipe (cartões da agenda). */
export function useSupportAgenda(ministryId: string | undefined, limit = 12) {
  return useQuery({
    queryKey: [...supportKeys.agenda(ministryId ?? ''), limit],
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3_600_000).toISOString()
      const services = await supabase
        .from('events')
        .select(SERVICE_COLS)
        .eq('ministry_id', ministryId ?? '')
        .eq('kind', 'service')
        .gte('starts_at', since)
        .order('starts_at')
        .limit(limit)
      if (services.error) throw services.error
      const ids = services.data.map((s) => s.id)
      if (ids.length === 0) return []
      const [rehearsals, team] = await Promise.all([
        supabase
          .from('events')
          .select(REHEARSAL_COLS)
          .in('service_event_id', ids)
          .order('starts_at'),
        supabase.from('schedule_assignments').select(TEAM_COLS).in('event_id', ids),
      ])
      if (rehearsals.error) throw rehearsals.error
      if (team.error) throw team.error
      return services.data.map((s) => ({
        ...s,
        songs: s.setlists[0]?.setlist_items[0]?.count ?? 0,
        rehearsals: rehearsals.data.filter((r) => r.service_event_id === s.id).map(toRehearsal),
        team: team.data.filter((a) => a.event_id === s.id).map(toTeamRow),
      }))
    },
  })
}

export type SupportService = NonNullable<ReturnType<typeof useSupportAgenda>['data']>[number]

/** Um culto: horários, ensaios, equipe e setlist com as cifras. */
export function useSupportEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: supportKeys.event(eventId ?? ''),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const service = await supabase
        .from('events')
        .select(
          'id, ministry_id, title, kind, starts_at, arrive_at, soundcheck_at, ends_at, location_name, notes',
        )
        .eq('id', eventId ?? '')
        .eq('kind', 'service')
        .maybeSingle()
      if (service.error) throw service.error
      if (!service.data) return null
      const [rehearsals, team, setlist] = await Promise.all([
        supabase
          .from('events')
          .select(REHEARSAL_COLS)
          .eq('service_event_id', service.data.id)
          .order('starts_at'),
        supabase.from('schedule_assignments').select(TEAM_COLS).eq('event_id', service.data.id),
        supabase
          .from('setlists')
          .select(
            'id, notes, setlist_items(id, position, key, notes, songs(id, title, artist, original_key, bpm, time_signature, chordpro))',
          )
          .eq('event_id', service.data.id)
          .maybeSingle(),
      ])
      if (rehearsals.error) throw rehearsals.error
      if (team.error) throw team.error
      if (setlist.error) throw setlist.error
      return {
        ...service.data,
        rehearsals: rehearsals.data.map(toRehearsal),
        team: team.data.map(toTeamRow),
        setlistNotes: setlist.data?.notes ?? null,
        items: [...(setlist.data?.setlist_items ?? [])].sort((a, b) => a.position - b.position),
      }
    },
  })
}

export type SupportEvent = NonNullable<NonNullable<ReturnType<typeof useSupportEvent>['data']>>
export type SupportSetlistItem = SupportEvent['items'][number]

type RehearsalRow = {
  id: string
  title: string
  starts_at: string
  arrive_at: string | null
  ends_at: string | null
  rehearsal_groups: { name: string } | null
}

function toRehearsal(r: RehearsalRow) {
  return {
    id: r.id,
    title: r.title,
    starts_at: r.starts_at,
    arrive_at: r.arrive_at,
    ends_at: r.ends_at,
    group_name: r.rehearsal_groups?.name ?? null,
  }
}

export type SupportRehearsal = ReturnType<typeof toRehearsal>

type TeamRow = {
  id: string
  status: string
  ministry_role_id: string | null
  ministry_roles: { name: string; sort_order: number } | null
  ministry_members: { profiles: { full_name: string | null } | null } | null
}

function toTeamRow(a: TeamRow) {
  return {
    id: a.id,
    status: a.status,
    role: a.ministry_roles?.name ?? 'Sem função',
    rolePosition: a.ministry_roles?.sort_order ?? 999,
    name: a.ministry_members?.profiles?.full_name?.trim() || 'Sem nome',
  }
}

export type SupportTeamRow = ReturnType<typeof toTeamRow>

/** Para o líder: quem é apoio do ministério. */
export function useMinistrySupporters(ministryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: supportKeys.list(ministryId ?? ''),
    enabled: Boolean(ministryId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministry_supporters')
        .select('id, user_id, label, created_at, profiles(full_name, phone)')
        .eq('ministry_id', ministryId ?? '')
      if (error) throw error
      return data
        .map((s) => ({ ...s, name: s.profiles?.full_name?.trim() || 'Sem nome' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    },
  })
}

export type SupporterRow = NonNullable<ReturnType<typeof useMinistrySupporters>['data']>[number]
