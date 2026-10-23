import { useMemo } from 'react'
import type { Assignment, EventLike, MemberLike, Unavailability } from '@domain/schedule.ts'

import { useMinistryMembers } from '@/features/members/queries'
import { useMinistryRoles } from '@/features/ministries/queries'
import {
  useEligibility,
  useMonthEvents,
  useUnavailability,
  type ScheduleEvent,
} from '@/features/schedule/queries'

/** Junta tudo o que as regras da escala precisam para um mês. */
export function useScheduleData(ministryId: string | undefined, year: number, month: number) {
  const events = useMonthEvents(ministryId, year, month)
  const members = useMinistryMembers(ministryId)
  const roles = useMinistryRoles(ministryId)
  const unavailability = useUnavailability(ministryId)
  const eligibility = useEligibility(ministryId)

  const data = useMemo(() => {
    const eventList: ScheduleEvent[] = events.data ?? []
    const domainEvents: EventLike[] = eventList.map((e) => ({
      id: e.id,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
    }))
    const assignments: Assignment[] = eventList.flatMap((e) => e.schedule_assignments)
    const memberList: MemberLike[] = (members.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      roleIds: m.roleIds,
    }))
    const unav: Unavailability[] = (unavailability.data ?? []).map((u) => ({
      ministry_member_id: u.ministry_member_id,
      starts_at: u.starts_at,
      ends_at: u.ends_at,
      recurrence_rule: u.recurrence_rule,
    }))
    return {
      events: eventList,
      domainEvents,
      assignments,
      members: memberList,
      memberById: new Map(memberList.map((m) => [m.id, m])),
      roles: roles.data ?? [],
      roleName: new Map((roles.data ?? []).map((r) => [r.id, r.name])),
      unavailability: unav,
      unavailabilityRows: unavailability.data ?? [],
      eligibility: eligibility.data ?? {
        hasClosedCycle: false,
        evaluated: new Set<string>(),
        eligible: new Set<string>(),
      },
    }
  }, [events.data, members.data, roles.data, unavailability.data, eligibility.data])

  return {
    ...data,
    isPending: events.isPending || members.isPending || roles.isPending,
    error:
      events.error ?? members.error ?? roles.error ?? unavailability.error ?? eligibility.error,
    refetch: () => void events.refetch(),
  }
}

export type ScheduleData = ReturnType<typeof useScheduleData>
