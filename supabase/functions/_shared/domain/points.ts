// Regras de presença e pontos (funções puras).
//
// Regras (CLAUDE.md):
// - Atraso até a tolerância: sem desconto. Depois disso, desconto por faixa
//   do atraso TOTAL (padrão: até 20 min −5; acima −10).
// - Falta sem aviso: −20. Falta/atraso justificado antes e aprovado: 0.
// - Saldo = soma do ledger. No fechamento, saldo ≥ mínimo → elegível.
// - "Esqueci de registrar": até 48h após o fim do evento; limite por ciclo
//   (acima dele o líder vê alerta, mas o pedido é aceito).

export type PenaltyTier = { upToMin: number | null; points: number }

export type PointRules = {
  lateToleranceMin: number
  lateTiers: PenaltyTier[]
  absencePenalty: number
  startingPoints: number
  minPoints: number
  requestLimitPerCycle: number
  requestDeadlineHours: number
}

export const DEFAULT_RULES: PointRules = {
  lateToleranceMin: 10,
  lateTiers: [
    { upToMin: 20, points: 5 },
    { upToMin: null, points: 10 },
  ],
  absencePenalty: 20,
  startingPoints: 100,
  minPoints: 70,
  requestLimitPerCycle: 3,
  requestDeadlineHours: 48,
}

export type EventKind = 'service' | 'rehearsal' | 'other'

/**
 * Converte a linha de ministry_settings para as regras. A tolerância depende
 * do tipo de evento (culto e ensaio têm a sua; outros usam a geral).
 */
export function rulesFromSettings(
  row: {
    late_tolerance_min: number
    service_tolerance_min?: number | null
    rehearsal_tolerance_min?: number | null
    late_penalty_tiers: unknown
    absence_penalty: number
    cycle_starting_points: number
    cycle_min_points: number
    checkin_request_limit_per_cycle: number
    checkin_request_deadline_hours: number
  },
  kind: EventKind | string = 'other',
): PointRules {
  const tolerance =
    kind === 'service'
      ? row.service_tolerance_min
      : kind === 'rehearsal'
        ? row.rehearsal_tolerance_min
        : null
  return {
    lateToleranceMin: tolerance ?? row.late_tolerance_min,
    lateTiers: normalizeTiers(row.late_penalty_tiers),
    absencePenalty: row.absence_penalty,
    startingPoints: row.cycle_starting_points,
    minPoints: row.cycle_min_points,
    requestLimitPerCycle: row.checkin_request_limit_per_cycle,
    requestDeadlineHours: row.checkin_request_deadline_hours,
  }
}

export function normalizeTiers(raw: unknown): PenaltyTier[] {
  if (!Array.isArray(raw)) return DEFAULT_RULES.lateTiers
  const tiers = raw
    .map((t) => ({
      upToMin: t && typeof t.upToMin === 'number' ? t.upToMin : null,
      points: t && typeof t.points === 'number' ? Math.abs(t.points) : 0,
    }))
    .sort((a, b) => (a.upToMin ?? Infinity) - (b.upToMin ?? Infinity))
  return tiers.length ? tiers : DEFAULT_RULES.lateTiers
}

/** Minutos de atraso (0 se chegou antes ou na hora). */
export function lateMinutes(eventStart: Date | string, arrivedAt: Date | string): number {
  const diff = new Date(arrivedAt).getTime() - new Date(eventStart).getTime()
  return diff <= 0 ? 0 : Math.floor(diff / 60_000)
}

/** Pontos a descontar (número positivo) para um atraso. */
export function latePenalty(minutesLate: number, rules: PointRules): number {
  if (minutesLate <= rules.lateToleranceMin) return 0
  const tier = rules.lateTiers.find((t) => t.upToMin === null || minutesLate <= t.upToMin)
  return tier ? tier.points : (rules.lateTiers[rules.lateTiers.length - 1]?.points ?? 0)
}

export type AttendanceKind = 'on_time' | 'late' | 'justified' | 'absent'

export type AttendanceOutcome = {
  kind: AttendanceKind
  lateMinutes: number
  /** variação no ledger (≤ 0) */
  delta: number
}

/**
 * Resultado da presença num evento.
 * - arrivedAt null = não veio.
 * - justified = justificativa (antes do evento) aprovada pelo líder.
 */
export function attendanceOutcome(params: {
  eventStart: Date | string
  arrivedAt: Date | string | null
  justified: boolean
  rules: PointRules
}): AttendanceOutcome {
  const { eventStart, arrivedAt, justified, rules } = params
  if (!arrivedAt) {
    return justified
      ? { kind: 'justified', lateMinutes: 0, delta: 0 }
      : { kind: 'absent', lateMinutes: 0, delta: -rules.absencePenalty }
  }
  const minutes = lateMinutes(eventStart, arrivedAt)
  const penalty = latePenalty(minutes, rules)
  if (penalty === 0) return { kind: 'on_time', lateMinutes: minutes, delta: 0 }
  if (justified) return { kind: 'justified', lateMinutes: minutes, delta: 0 }
  return { kind: 'late', lateMinutes: minutes, delta: -penalty }
}

export function balance(entries: { delta: number }[]): number {
  return entries.reduce((sum, e) => sum + e.delta, 0)
}

export function isEligibleAtClose(
  finalBalance: number,
  rules: Pick<PointRules, 'minPoints'>,
): boolean {
  return finalBalance >= rules.minPoints
}

// ---------------------------------------------------------------------------
// "Esqueci de registrar"
// ---------------------------------------------------------------------------

export type RequestCheck =
  | { ok: true; overLimit: boolean }
  | { ok: false; reason: 'before_event' | 'deadline_passed' | 'declared_out_of_range' }

/**
 * Pode criar o pedido? Só depois do início do evento e até `deadlineHours`
 * após o fim. O horário declarado tem de estar entre 2h antes do início e o
 * fim do evento. Passar do limite do ciclo não bloqueia: gera alerta.
 */
export function checkCheckinRequest(params: {
  eventStart: Date | string
  eventEnd: Date | string
  declaredArrivedAt: Date | string
  now: Date | string
  requestsInCycle: number
  rules: Pick<PointRules, 'requestDeadlineHours' | 'requestLimitPerCycle'>
}): RequestCheck {
  const start = new Date(params.eventStart).getTime()
  const end = new Date(params.eventEnd).getTime()
  const now = new Date(params.now).getTime()
  const declared = new Date(params.declaredArrivedAt).getTime()
  if (now < start) return { ok: false, reason: 'before_event' }
  if (now > end + params.rules.requestDeadlineHours * 3_600_000)
    return { ok: false, reason: 'deadline_passed' }
  if (declared < start - 2 * 3_600_000 || declared > end)
    return { ok: false, reason: 'declared_out_of_range' }
  return { ok: true, overLimit: params.requestsInCycle >= params.rules.requestLimitPerCycle }
}

export type ReviewDecision =
  | { decision: 'approve' }
  | { decision: 'adjust'; arrivedAt: Date | string }
  | { decision: 'reject' }

/** Resultado da revisão do líder sobre um pedido. Recusado vira falta. */
export function reviewOutcome(params: {
  eventStart: Date | string
  declaredArrivedAt: Date | string
  review: ReviewDecision
  justified: boolean
  rules: PointRules
}): AttendanceOutcome & { arrivedAt: string | null } {
  const { review } = params
  const arrivedAt =
    review.decision === 'approve'
      ? new Date(params.declaredArrivedAt).toISOString()
      : review.decision === 'adjust'
        ? new Date(review.arrivedAt).toISOString()
        : null
  return {
    ...attendanceOutcome({
      eventStart: params.eventStart,
      arrivedAt,
      justified: params.justified,
      rules: params.rules,
    }),
    arrivedAt,
  }
}

// ---------------------------------------------------------------------------
// Ciclo
// ---------------------------------------------------------------------------

/** Próximo ciclo começa no dia seguinte ao fim do atual. */
export function nextCycleRange(
  endsOn: string,
  months: number,
): { startsOn: string; endsOn: string } {
  const [y, m, d] = endsOn.split('-').map(Number)
  const start = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1))
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate() - 1),
  )
  return { startsOn: start.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10) }
}

// ---------------------------------------------------------------------------
// Quem passa da tolerância pode ficar de fora (regra do ministério)
// ---------------------------------------------------------------------------

export type LateConsequenceRule = {
  service_late_consequence?: string | null // 'points' | 'no_play'
  rehearsal_late_consequence?: string | null // 'points' | 'out_rehearsal' | 'out_rehearsal_and_service'
}

/** 'none' | fica fora deste evento | fica fora do ensaio e do culto dele */
export type ConsequenceScope = 'none' | 'event' | 'event_and_service'

export function lateConsequence(params: {
  kind: EventKind | string
  /** chegou depois da tolerância (e não tinha justificativa aprovada) */
  beyondTolerance: boolean
  /** o ensaio está ligado a um culto? */
  linkedToService: boolean
  rule: LateConsequenceRule
}): ConsequenceScope {
  const { kind, beyondTolerance, linkedToService, rule } = params
  if (!beyondTolerance) return 'none'
  if (kind === 'service') return rule.service_late_consequence === 'no_play' ? 'event' : 'none'
  if (kind === 'rehearsal') {
    if (rule.rehearsal_late_consequence === 'out_rehearsal') return 'event'
    if (rule.rehearsal_late_consequence === 'out_rehearsal_and_service') {
      return linkedToService ? 'event_and_service' : 'event'
    }
  }
  return 'none'
}

/** Texto do motivo, para a escala e os avisos. */
export function consequenceReason(scope: ConsequenceScope, limit: string): string {
  if (scope === 'event_and_service') return `Chegou depois de ${limit}: fora do ensaio e do culto`
  if (scope === 'event') return `Chegou depois de ${limit}: fora deste evento`
  return ''
}
