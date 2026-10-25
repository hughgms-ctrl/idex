import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import type { Commitment } from '@domain/gamification.ts'

export const attendanceKeys = {
  all: ['attendance'] as const,
  myLedger: (memberId: string, cycleId: string) =>
    ['attendance', 'ledger', memberId, cycleId] as const,
  myEvents: (memberId: string) => ['attendance', 'my-events', memberId] as const,
  live: (eventId: string) => ['attendance', 'live', eventId] as const,
  leaderEvents: (ministryId: string) => ['attendance', 'leader-events', ministryId] as const,
  pending: (ministryId: string) => ['attendance', 'pending', ministryId] as const,
  balances: (ministryId: string, cycleId: string) =>
    ['attendance', 'balances', ministryId, cycleId] as const,
  history: (memberId: string) => ['attendance', 'history', memberId] as const,
  monthStats: (ministryId: string) => ['attendance', 'month-stats', ministryId] as const,
}

export const LEDGER_REASON: Record<string, string> = {
  cycle_start: 'Saldo inicial do ciclo',
  late: 'Atraso',
  absence: 'Falta sem aviso',
  request_rejected: 'Pedido recusado (falta)',
  adjustment: 'Ajuste do líder',
  recovery: 'Recuperação de pontos',
}

/** Lançamentos do membro no ciclo (o saldo é a soma). */
export function useMyLedger(memberId: string | undefined, cycleId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.myLedger(memberId ?? '', cycleId ?? ''),
    enabled: Boolean(memberId && cycleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_ledger')
        .select(
          'id, delta, reason, note, created_at, events(title, starts_at, arrive_at), checkins(arrived_at, late_minutes)',
        )
        .eq('ministry_member_id', memberId ?? '')
        .eq('cycle_id', cycleId ?? '')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Eventos do membro: recentes (para "esqueci") e próximos (para justificar). */
export function useMyAttendanceEvents(memberId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.myEvents(memberId ?? ''),
    enabled: Boolean(memberId),
    queryFn: async () => {
      const since = new Date(Date.now() - 4 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, events!inner(id, title, kind, starts_at, ends_at)')
        .eq('ministry_member_id', memberId ?? '')
        .gte('events.starts_at', since)
      if (error) throw error
      const eventIds = data.map((a) => a.events.id)
      const [checkins, requests, justifications] = await Promise.all([
        supabase
          .from('checkins')
          .select('event_id, arrived_at, late_minutes')
          .eq('ministry_member_id', memberId ?? '')
          .in('event_id', eventIds),
        supabase
          .from('checkin_requests')
          .select('event_id, status, declared_arrived_at, adjusted_arrived_at')
          .eq('ministry_member_id', memberId ?? '')
          .in('event_id', eventIds),
        supabase
          .from('justifications')
          .select('id, event_id, status, kind, reason')
          .eq('ministry_member_id', memberId ?? '')
          .in('event_id', eventIds),
      ])
      for (const r of [checkins, requests, justifications]) if (r.error) throw r.error
      return data
        .map((a) => ({
          event: a.events,
          checkin: checkins.data?.find((c) => c.event_id === a.events.id) ?? null,
          request: requests.data?.find((r) => r.event_id === a.events.id) ?? null,
          justification: justifications.data?.find((j) => j.event_id === a.events.id) ?? null,
        }))
        .sort((x, y) => x.event.starts_at.localeCompare(y.event.starts_at))
    },
  })
}

export type MyAttendanceEvent = NonNullable<
  ReturnType<typeof useMyAttendanceEvents>['data']
>[number]

/** Eventos para o painel do líder (últimos 2 dias e próximos 7). */
export function useLeaderEvents(ministryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: attendanceKeys.leaderEvents(ministryId ?? ''),
    enabled: Boolean(ministryId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, kind, starts_at, ends_at')
        .eq('ministry_id', ministryId ?? '')
        .gte('starts_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
        .lte('starts_at', new Date(Date.now() + 7 * 86_400_000).toISOString())
        .order('starts_at')
      if (error) throw error
      return data
    },
  })
}

/** Painel ao vivo de um evento (atualiza a cada 10 s). */
export function useLiveAttendance(eventId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.live(eventId ?? ''),
    enabled: Boolean(eventId),
    refetchInterval: 10_000,
    queryFn: async () => {
      const id = eventId ?? ''
      const [assignments, checkins, justifications, requests, ledger] = await Promise.all([
        supabase
          .from('schedule_assignments')
          .select('ministry_member_id, ministry_role_id')
          .eq('event_id', id)
          .neq('status', 'declined'),
        supabase
          .from('checkins')
          .select('ministry_member_id, arrived_at, late_minutes, source')
          .eq('event_id', id),
        supabase
          .from('justifications')
          .select('ministry_member_id, status, kind')
          .eq('event_id', id),
        supabase.from('checkin_requests').select('ministry_member_id, status').eq('event_id', id),
        supabase
          .from('point_ledger')
          .select('ministry_member_id, delta, reason')
          .eq('event_id', id),
      ])
      for (const r of [assignments, checkins, justifications, requests, ledger])
        if (r.error) throw r.error
      return {
        assignments: assignments.data ?? [],
        checkins: checkins.data ?? [],
        justifications: justifications.data ?? [],
        requests: requests.data ?? [],
        ledger: ledger.data ?? [],
      }
    },
  })
}

/** Fila do líder: pedidos e justificativas pendentes. */
export function usePendingReviews(ministryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: attendanceKeys.pending(ministryId ?? ''),
    enabled: Boolean(ministryId) && enabled,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [requests, justifications] = await Promise.all([
        supabase
          .from('checkin_requests')
          .select(
            '*, events!inner(id, title, starts_at, ministry_id), ministry_members(profiles(full_name))',
          )
          .eq('status', 'pending')
          .eq('events.ministry_id', ministryId ?? '')
          .order('created_at'),
        supabase
          .from('justifications')
          .select(
            '*, events!inner(id, title, starts_at, ministry_id), ministry_members(profiles(full_name))',
          )
          .eq('status', 'pending')
          .eq('events.ministry_id', ministryId ?? '')
          .order('created_at'),
      ])
      if (requests.error) throw requests.error
      if (justifications.error) throw justifications.error
      const pairs = requests.data.map(
        (r) => `and(event_id.eq.${r.event_id},ministry_member_id.eq.${r.ministry_member_id})`,
      )
      const attempts = pairs.length
        ? await supabase
            .from('checkin_attempts')
            .select('event_id, ministry_member_id, attempted_at, outcome, distance_m, accuracy_m')
            .or(pairs.join(','))
            .order('attempted_at')
        : { data: [], error: null }
      if (attempts.error) throw attempts.error
      return {
        requests: requests.data,
        justifications: justifications.data,
        attempts: attempts.data ?? [],
      }
    },
  })
}

/** Saldos de todo o ministério no ciclo. */
export function useMinistryBalances(
  ministryId: string | undefined,
  cycleId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: attendanceKeys.balances(ministryId ?? '', cycleId ?? ''),
    enabled: Boolean(ministryId && cycleId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_cycle_balance')
        .select('ministry_member_id, balance, penalties')
        .eq('cycle_id', cycleId ?? '')
      if (error) throw error
      return data
    },
  })
}

/** Eventos em que estou escalado e cujo check-in está aberto agora (2h antes até o fim). */
export function useMyOpenCheckinEvents(memberId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'open-now', memberId ?? ''],
    enabled: Boolean(memberId) && enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = Date.now()
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, status, events!inner(id, title, kind, starts_at, ends_at, location_name)')
        .eq('ministry_member_id', memberId ?? '')
        .neq('status', 'declined')
        .gte('events.starts_at', new Date(now - 12 * 3_600_000).toISOString())
        .lte('events.starts_at', new Date(now + 2 * 3_600_000).toISOString())
      if (error) throw error
      const seen = new Set<string>()
      return data
        .map((a) => a.events)
        .filter((e) => {
          const start = new Date(e.starts_at).getTime()
          const end = e.ends_at ? new Date(e.ends_at).getTime() : start + 2 * 3_600_000
          if (seen.has(e.id) || now < start - 2 * 3_600_000 || now > end) return false
          seen.add(e.id)
          return true
        })
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    },
  })
}

/**
 * Histórico do integrante (último ano) para sequência, selos e resumo do
 * ciclo: cada escala com o registro, aviso aprovado e pedido pendente.
 */
export function useMyHistory(memberId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.history(memberId ?? ''),
    enabled: Boolean(memberId),
    queryFn: async () => {
      const id = memberId ?? ''
      const since = new Date(Date.now() - 365 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('status, events!inner(id, kind, starts_at, ends_at, arrive_at, soundcheck_at)')
        .eq('ministry_member_id', id)
        .neq('status', 'declined')
        .gte('events.starts_at', since)
        .lte('events.starts_at', new Date().toISOString())
      if (error) throw error
      const [checkins, justifications, requests, closed] = await Promise.all([
        supabase
          .from('checkins')
          .select('event_id, arrived_at, late_minutes')
          .eq('ministry_member_id', id)
          .gte('arrived_at', new Date(Date.parse(since) - 6 * 3_600_000).toISOString()),
        supabase
          .from('justifications')
          .select('event_id')
          .eq('ministry_member_id', id)
          .eq('status', 'approved'),
        supabase
          .from('checkin_requests')
          .select('event_id')
          .eq('ministry_member_id', id)
          .eq('status', 'pending'),
        supabase
          .from('cycle_eligibility')
          .select('balance, cycles!inner(status, starts_on, ends_on)')
          .eq('ministry_member_id', id)
          .eq('cycles.status', 'closed'),
      ])
      for (const r of [checkins, justifications, requests, closed]) if (r.error) throw r.error
      const checkinBy = Object.fromEntries((checkins.data ?? []).map((c) => [c.event_id, c]))
      const approved = new Set((justifications.data ?? []).map((j) => j.event_id))
      const pending = new Set((requests.data ?? []).map((r) => r.event_id))
      // a mesma pessoa pode estar em duas funções no mesmo evento: um compromisso
      const byEvent: Record<string, Commitment> = {}
      for (const a of data) {
        const e = a.events
        const c = checkinBy[e.id]
        const prev = byEvent[e.id]
        byEvent[e.id] = {
          eventId: e.id,
          kind: e.kind,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          callAt: e.arrive_at ?? e.starts_at,
          soundcheckAt: e.soundcheck_at,
          arrivedAt: c?.arrived_at ?? null,
          lateMinutes: c?.late_minutes ?? null,
          benched: (prev?.benched ?? true) && a.status === 'benched',
          justificationApproved: approved.has(e.id),
          requestPending: pending.has(e.id),
        }
      }
      return {
        commitments: Object.values(byEvent),
        closedCycles: (closed.data ?? []).map((c) => ({
          balance: c.balance,
          startsOn: c.cycles.starts_on,
          endsOn: c.cycles.ends_on,
        })),
      }
    },
  })
}

export type TeamMonthStats = {
  on_time: number
  late: number
  absent: number
  goal: number
  highlights: string[]
}

/** % no horário da equipe no mês e destaques (todos do ministério veem). */
export function useMonthStats(ministryId: string | undefined) {
  return useQuery({
    queryKey: attendanceKeys.monthStats(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ministry_month_stats', {
        p_ministry_id: ministryId ?? '',
      })
      if (error) throw error
      return (data as TeamMonthStats | null) ?? null
    },
  })
}
