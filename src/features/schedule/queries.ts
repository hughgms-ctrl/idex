import { useQuery } from '@tanstack/react-query'
import { monthRange } from '@domain/time.ts'

import { supabase } from '@/lib/supabase'

export const scheduleKeys = {
  all: ['schedule'] as const,
  month: (ministryId: string, year: number, month: number) =>
    ['schedule', 'month', ministryId, year, month] as const,
  event: (eventId: string) => ['schedule', 'event', eventId] as const,
  unavailability: (ministryId: string) => ['schedule', 'unavailability', ministryId] as const,
  eligibility: (ministryId: string) => ['schedule', 'eligibility', ministryId] as const,
  mine: (memberId: string) => ['schedule', 'mine', memberId] as const,
}

const EVENT_SELECT =
  'id, church_id, ministry_id, kind, title, starts_at, arrive_at, soundcheck_at, ends_at, service_event_id, location_name, notes, recurrence_parent_id, recurrence_rule, schedule_assignments(id, event_id, ministry_member_id, ministry_role_id, status, benched_reason)'

export function useMonthEvents(ministryId: string | undefined, year: number, month: number) {
  return useQuery({
    queryKey: scheduleKeys.month(ministryId ?? '', year, month),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { start, end } = monthRange(year, month)
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('ministry_id', ministryId ?? '')
        .gte('starts_at', start.toISOString())
        .lt('starts_at', end.toISOString())
        .order('starts_at')
      if (error) throw error
      return data
    },
  })
}

export type ScheduleEvent = NonNullable<ReturnType<typeof useMonthEvents>['data']>[number]

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: scheduleKeys.event(eventId ?? ''),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('id', eventId ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Indisponibilidades visíveis (as minhas; se líder, as de todo o ministério). */
export function useUnavailability(ministryId: string | undefined) {
  return useQuery({
    queryKey: scheduleKeys.unavailability(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_unavailability')
        .select('*, ministry_members!inner(ministry_id)')
        .eq('ministry_members.ministry_id', ministryId ?? '')
        .gte('ends_at', new Date(Date.now() - 31 * 86_400_000).toISOString())
        .order('starts_at')
      if (error) throw error
      return data
    },
  })
}

/** Resultado do último fechamento (listas simples: o cache offline guarda JSON). */
export type EligibilityRows = { hasClosedCycle: boolean; evaluated: string[]; eligible: string[] }

/** Resultado do último fechamento de ciclo (quem pode ser escalado). */
export function useEligibility(ministryId: string | undefined) {
  return useQuery({
    queryKey: scheduleKeys.eligibility(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async (): Promise<EligibilityRows> => {
      const { data: cycle, error } = await supabase
        .from('cycles')
        .select('id')
        .eq('ministry_id', ministryId ?? '')
        .eq('status', 'closed')
        .order('ends_on', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!cycle) return { hasClosedCycle: false, evaluated: [], eligible: [] }
      const { data: rows, error: err } = await supabase
        .from('cycle_eligibility')
        .select('ministry_member_id, eligible')
        .eq('cycle_id', cycle.id)
      if (err) throw err
      return {
        hasClosedCycle: true,
        evaluated: rows.map((r) => r.ministry_member_id),
        eligible: rows.filter((r) => r.eligible).map((r) => r.ministry_member_id),
      }
    },
  })
}

/** Próximas escalas do membro logado. */
export function useMyUpcomingAssignments(memberId: string | undefined, limit = 3) {
  return useQuery({
    queryKey: [...scheduleKeys.mine(memberId ?? ''), limit],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, ministry_role_id, events!inner(id, title, kind, starts_at)')
        .eq('ministry_member_id', memberId ?? '')
        .gte('events.starts_at', new Date().toISOString())
        .order('starts_at', { referencedTable: 'events' })
      if (error) throw error
      return data
        .sort((a, b) => a.events.starts_at.localeCompare(b.events.starts_at))
        .slice(0, limit)
    },
  })
}

/** Ensaio ligado a um culto (pode cair no mês anterior). */
export function useLinkedRehearsal(serviceId: string | undefined) {
  return useQuery({
    queryKey: [...scheduleKeys.all, 'rehearsal-of', serviceId ?? ''],
    enabled: Boolean(serviceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, starts_at, arrive_at, ends_at')
        .eq('service_event_id', serviceId ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
