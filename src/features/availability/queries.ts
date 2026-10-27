import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDaysToKey, parseDateKey, zonedToUtc } from '@domain/time.ts'

import { supabase } from '@/lib/supabase'

export const availabilityKeys = {
  all: ['availability'] as const,
  upcoming: (ministryId: string) => ['availability', 'events', ministryId] as const,
  mine: (memberId: string) => ['availability', 'mine', memberId] as const,
  ministry: (ministryId: string) => ['availability', 'ministry', ministryId] as const,
  myRoles: (memberId: string) => ['availability', 'roles', memberId] as const,
}

export type AvailabilityPeriod = { startsOn: string; endsOn: string } // YYYY-MM-DD, inclusivo

function dayStart(key: string): string {
  const { year, month, day } = parseDateKey(key)
  return zonedToUtc(year, month, day, 0, 0).toISOString()
}

/**
 * Cultos, ensaios e eventos do período aberto pelo líder (só os que ainda
 * não começaram).
 */
export function useUpcomingEvents(
  ministryId: string | undefined,
  period: AvailabilityPeriod | null,
) {
  return useQuery({
    queryKey: [...availabilityKeys.upcoming(ministryId ?? ''), period?.startsOn, period?.endsOn],
    enabled: Boolean(ministryId && period),
    queryFn: async () => {
      if (!period) return []
      const from = dayStart(period.startsOn)
      const now = new Date().toISOString()
      // ensaio ligado a culto não aparece sozinho: vai junto do culto
      const { data, error } = await supabase
        .from('events')
        .select('id, church_id, kind, title, starts_at, arrive_at, ends_at, location_name')
        .eq('ministry_id', ministryId ?? '')
        .is('service_event_id', null)
        .gte('starts_at', from > now ? from : now)
        .lt('starts_at', dayStart(addDaysToKey(period.endsOn, 1)))
        .order('starts_at')
      if (error) throw error
      const ids = data.filter((e) => e.kind === 'service').map((e) => e.id)
      const { data: rehearsals, error: err } = ids.length
        ? await supabase
            .from('events')
            .select('service_event_id, starts_at, rehearsal_groups(name)')
            .in('service_event_id', ids)
            .order('starts_at')
        : { data: [], error: null }
      if (err) throw err
      // um culto pode ter mais de um ensaio (banda, vozes…)
      return data.map((e) => ({
        ...e,
        rehearsals: rehearsals
          .filter((r) => r.service_event_id === e.id)
          .map((r) => ({ starts_at: r.starts_at, name: r.rehearsal_groups?.name ?? null })),
      }))
    },
  })
}

export type UpcomingEvent = NonNullable<ReturnType<typeof useUpcomingEvents>['data']>[number]

/** Respostas do membro logado. */
export function useMyAvailability(memberId: string | undefined) {
  return useQuery({
    queryKey: availabilityKeys.mine(memberId ?? ''),
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_availability')
        .select('event_id, available, note')
        .eq('ministry_member_id', memberId ?? '')
      if (error) throw error
      return data
    },
  })
}

/** Respostas de todo o ministério (o líder vê todas; o membro, só as dele). */
export function useMinistryAvailability(ministryId: string | undefined) {
  return useQuery({
    queryKey: availabilityKeys.ministry(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_availability')
        .select('event_id, ministry_member_id, available, note, events!inner(ministry_id)')
        .eq('events.ministry_id', ministryId ?? '')
        .gte('events.starts_at', new Date(Date.now() - 31 * 86_400_000).toISOString())
      if (error) throw error
      return data.map(({ event_id, ministry_member_id, available, note }) => ({
        event_id,
        ministry_member_id,
        available,
        note,
      }))
    },
  })
}

/** true = posso, false = não posso, null = apaga a resposta. */
export function useSetAvailability(memberId: string | undefined, churchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, available }: { eventId: string; available: boolean | null }) => {
      if (!memberId) throw new Error('Você ainda não faz parte deste ministério')
      if (available === null) {
        const { error } = await supabase
          .from('event_availability')
          .delete()
          .eq('event_id', eventId)
          .eq('ministry_member_id', memberId)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('event_availability').upsert({
        church_id: churchId,
        event_id: eventId,
        ministry_member_id: memberId,
        available,
      })
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: availabilityKeys.all }),
  })
}

/** Funções (instrumentos/voz) do membro. */
export function useMyRoleIds(memberId: string | undefined) {
  return useQuery({
    queryKey: availabilityKeys.myRoles(memberId ?? ''),
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministry_member_roles')
        .select('ministry_role_id')
        .eq('ministry_member_id', memberId ?? '')
      if (error) throw error
      return data.map((r) => r.ministry_role_id)
    },
  })
}

export type RehearsalStatus = 'any' | 'some' | 'none'

export const REHEARSAL_STATUS_LABEL: Record<RehearsalStatus, string> = {
  any: 'Qualquer dia',
  some: 'Só alguns dias',
  none: 'Nenhum dia',
}
export type RehearsalAnswer = {
  event_id: string
  ministry_member_id: string
  status: RehearsalStatus
  note: string | null
}

/** Disponibilidade para o ensaio (por culto) do membro logado. */
export function useMyRehearsalAvailability(memberId: string | undefined) {
  return useQuery({
    queryKey: [...availabilityKeys.all, 'rehearsal-mine', memberId ?? ''],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rehearsal_availability')
        .select('event_id, ministry_member_id, status, note')
        .eq('ministry_member_id', memberId ?? '')
      if (error) throw error
      return Object.fromEntries((data as RehearsalAnswer[]).map((r) => [r.event_id, r])) as Record<
        string,
        RehearsalAnswer
      >
    },
  })
}

/** Respostas de um culto (o líder vê todas; o membro, só a dele). */
export function useServiceRehearsalAvailability(serviceId: string | undefined) {
  return useQuery({
    queryKey: [...availabilityKeys.all, 'rehearsal-service', serviceId ?? ''],
    enabled: Boolean(serviceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rehearsal_availability')
        .select('event_id, ministry_member_id, status, note')
        .eq('event_id', serviceId ?? '')
      if (error) throw error
      return data as RehearsalAnswer[]
    },
  })
}

/** Grava (ou apaga, com status null) a disponibilidade para o ensaio do culto. */
export function useSetRehearsalAvailability(memberId: string | undefined, churchId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      serviceId,
      status,
      note,
    }: {
      serviceId: string
      status: RehearsalStatus | null
      note: string | null
    }) => {
      if (!memberId) throw new Error('Você ainda não faz parte deste ministério')
      if (status === null) {
        const { error } = await supabase
          .from('rehearsal_availability')
          .delete()
          .eq('event_id', serviceId)
          .eq('ministry_member_id', memberId)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('rehearsal_availability').upsert({
        church_id: churchId,
        event_id: serviceId,
        ministry_member_id: memberId,
        status,
        note: note?.trim() || null,
      })
      if (error) throw error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: availabilityKeys.all }),
  })
}
