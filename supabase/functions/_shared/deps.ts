// Acesso ao banco usado pelas Edge Functions de presença. Recebe o
// `createClient` (jsr no Deno, npm nos testes locais) para ficar portátil.
/* eslint-disable @typescript-eslint/no-explicit-any */

type CreateClient = (url: string, key: string, options?: any) => any

export type EventContext = {
  event: {
    id: string
    church_id: string
    ministry_id: string
    kind: string
    service_event_id: string | null
    starts_at: string
    arrive_at: string | null
    ends_at: string | null
    lat: number | null
    lng: number | null
    radius_m: number | null
  }
  church: { lat: number | null; lng: number | null; checkin_radius_m: number }
  settings: Record<string, any>
  member: { id: string; status: string } | null
  assigned: boolean
  /** ficou de fora pela regra de atraso (status 'benched') */
  benched: boolean
  alreadyCheckedIn: boolean
  justified: boolean
}

export function makeDeps(
  createClient: CreateClient,
  env: { url: string; anonKey: string; serviceKey: string },
) {
  const service = createClient(env.url, env.serviceKey, { auth: { persistSession: false } })
  const asUser = (authorization: string) =>
    createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })

  async function must<T>(promise: Promise<{ data: T; error: any }>): Promise<T> {
    const { data, error } = await promise
    if (error) throw new Error(error.message)
    return data
  }

  return {
    getUserId: async (authorization: string): Promise<string | null> => {
      if (!authorization) return null
      const { data } = await asUser(authorization).auth.getUser()
      return data?.user?.id ?? null
    },

    isEventLeader: async (authorization: string, eventId: string): Promise<boolean> => {
      const { data } = await asUser(authorization).rpc('is_event_leader', { p_event_id: eventId })
      return data === true
    },

    isLeaderOfMember: async (authorization: string, memberId: string): Promise<boolean> => {
      const { data } = await asUser(authorization).rpc('is_leader_of_member', {
        p_ministry_member_id: memberId,
      })
      return data === true
    },

    loadEventContext: async (eventId: string, userId: string): Promise<EventContext | null> => {
      const event = await must<any>(
        service
          .from('events')
          .select(
            'id, church_id, ministry_id, kind, service_event_id, starts_at, arrive_at, ends_at, lat, lng, radius_m',
          )
          .eq('id', eventId)
          .maybeSingle(),
      )
      if (!event) return null
      const [church, settings, member] = await Promise.all([
        must<any>(
          service
            .from('churches')
            .select('lat, lng, checkin_radius_m')
            .eq('id', event.church_id)
            .single(),
        ),
        must<any>(
          service
            .from('ministry_settings')
            .select('*')
            .eq('ministry_id', event.ministry_id)
            .single(),
        ),
        must<any>(
          service
            .from('ministry_members')
            .select('id, status')
            .eq('ministry_id', event.ministry_id)
            .eq('user_id', userId)
            .maybeSingle(),
        ),
      ])
      let assigned = false
      let benched = false
      let alreadyCheckedIn = false
      let justified = false
      if (member) {
        const [a, c, j] = await Promise.all([
          must<any[]>(
            service
              .from('schedule_assignments')
              .select('id, status')
              .eq('event_id', eventId)
              .eq('ministry_member_id', member.id)
              .neq('status', 'declined'),
          ),
          must<any[]>(
            service
              .from('checkins')
              .select('id')
              .eq('event_id', eventId)
              .eq('ministry_member_id', member.id),
          ),
          must<any[]>(
            service
              .from('justifications')
              .select('id')
              .eq('event_id', eventId)
              .eq('ministry_member_id', member.id)
              .eq('status', 'approved'),
          ),
        ])
        assigned = a.length > 0
        benched = a.length > 0 && a.every((x: any) => x.status === 'benched')
        alreadyCheckedIn = c.length > 0
        justified = j.length > 0
      }
      return { event, church, settings, member, assigned, benched, alreadyCheckedIn, justified }
    },

    recordAttendance: (args: {
      eventId: string
      memberId: string
      arrivedAt: string
      lateMinutes: number
      delta: number
      source: 'qr' | 'geo'
      lat: number | null
      lng: number | null
      accuracyM: number | null
      distanceM: number | null
    }) =>
      must<string>(
        service.rpc('record_attendance', {
          p_event_id: args.eventId,
          p_ministry_member_id: args.memberId,
          p_arrived_at: args.arrivedAt,
          p_late_minutes: args.lateMinutes,
          p_delta: args.delta,
          p_source: args.source,
          p_lat: args.lat,
          p_lng: args.lng,
          p_accuracy_m: args.accuracyM,
          p_distance_m: args.distanceM,
        }),
      ),

    logAttempt: async (args: {
      eventId: string
      memberId: string
      outcome: string
      lat?: number | null
      lng?: number | null
      accuracyM?: number | null
      distanceM?: number | null
    }) => {
      await service.rpc('log_checkin_attempt', {
        p_event_id: args.eventId,
        p_ministry_member_id: args.memberId,
        p_outcome: args.outcome,
        p_lat: args.lat ?? null,
        p_lng: args.lng ?? null,
        p_accuracy_m: args.accuracyM ?? null,
        p_distance_m: args.distanceM ?? null,
      })
    },

    balanceFor: async (memberId: string, eventId: string): Promise<number | null> => {
      const cycleId = await must<string | null>(
        service.rpc('cycle_for_event', { p_event_id: eventId }),
      )
      if (!cycleId) return null
      const row = await must<any>(
        service
          .from('member_cycle_balance')
          .select('balance')
          .eq('ministry_member_id', memberId)
          .eq('cycle_id', cycleId)
          .maybeSingle(),
      )
      return row?.balance ?? null
    },

    loadRequest: async (requestId: string) => {
      const request = await must<any>(
        service.from('checkin_requests').select('*').eq('id', requestId).maybeSingle(),
      )
      if (!request) return null
      const event = await must<any>(
        service
          .from('events')
          .select('id, ministry_id, kind, service_event_id, starts_at, arrive_at')
          .eq('id', request.event_id)
          .single(),
      )
      const settings = await must<any>(
        service.from('ministry_settings').select('*').eq('ministry_id', event.ministry_id).single(),
      )
      const just = await must<any[]>(
        service
          .from('justifications')
          .select('id')
          .eq('event_id', request.event_id)
          .eq('ministry_member_id', request.ministry_member_id)
          .eq('status', 'approved'),
      )
      return { request, event, settings, justified: just.length > 0 }
    },

    applyReview: (args: {
      requestId: string
      status: 'approved' | 'adjusted' | 'rejected'
      arrivedAt: string | null
      lateMinutes: number
      delta: number
      reviewerId: string
      note: string | null
    }) =>
      must<null>(
        service.rpc('apply_checkin_request_review', {
          p_request_id: args.requestId,
          p_status: args.status,
          p_arrived_at: args.arrivedAt,
          p_late_minutes: args.lateMinutes,
          p_delta: args.delta,
          p_reviewer: args.reviewerId,
          p_note: args.note,
        }),
      ),

    /** Tira (ou devolve) a pessoa da escala pela regra de atraso. */
    applyConsequence: (args: {
      eventId: string
      memberId: string
      scope: 'none' | 'event' | 'event_and_service'
      reason: string | null
    }) =>
      must<number>(
        service.rpc('apply_late_consequence', {
          p_event_id: args.eventId,
          p_ministry_member_id: args.memberId,
          p_scope: args.scope,
          p_reason: args.reason,
        }),
      ),

    /**
     * QR fixo: acha o evento do integrante com o ponto aberto agora
     * (2h antes da chegada até o fim), o mais próximo do horário de chegada.
     */
    resolveCheckinCode: async (
      code: string,
      userId: string,
      nowMs: number,
    ): Promise<
      { status: 'ok'; eventId: string } | { status: 'invalid' | 'not_member' | 'none' }
    > => {
      const settings = await must<any>(
        service
          .from('ministry_settings')
          .select('ministry_id')
          .eq('checkin_code', code)
          .maybeSingle(),
      )
      if (!settings) return { status: 'invalid' }
      const member = await must<any>(
        service
          .from('ministry_members')
          .select('id')
          .eq('ministry_id', settings.ministry_id)
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle(),
      )
      if (!member) return { status: 'not_member' }
      const rows = await must<any[]>(
        service
          .from('schedule_assignments')
          .select('event_id, events!inner(id, ministry_id, starts_at, arrive_at, ends_at)')
          .eq('ministry_member_id', member.id)
          .neq('status', 'declined')
          .eq('events.ministry_id', settings.ministry_id)
          .gte('events.starts_at', new Date(nowMs - 12 * 3_600_000).toISOString())
          .lte('events.starts_at', new Date(nowMs + 8 * 3_600_000).toISOString()),
      )
      const open = rows
        .map((r) => r.events)
        .filter((e) => {
          const start = new Date(e.starts_at).getTime()
          const call = new Date(e.arrive_at ?? e.starts_at).getTime()
          const end = e.ends_at ? new Date(e.ends_at).getTime() : start + 2 * 3_600_000
          return nowMs >= call - 2 * 3_600_000 && nowMs <= end
        })
        .sort(
          (a, b) =>
            Math.abs(new Date(a.arrive_at ?? a.starts_at).getTime() - nowMs) -
            Math.abs(new Date(b.arrive_at ?? b.starts_at).getTime() - nowMs),
        )
      return open[0] ? { status: 'ok', eventId: open[0].id } : { status: 'none' }
    },
  }
}

export type Deps = ReturnType<typeof makeDeps>
