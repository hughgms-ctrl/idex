// Gamificação da presença (funções puras): sequência no horário, selos,
// margem até o mínimo e recuperação de pontos.
//
// Cada compromisso (culto/ensaio em que a pessoa estava escalada) vira um
// resultado:
// - on_time: registrou dentro da tolerância
// - late: registrou depois da tolerância sem aviso aprovado
// - excused: aviso aprovado (veio atrasado ou faltou) — não conta nem zera
// - absent: não veio e não tinha aviso aprovado
// - neutral: ainda não terminou, pedido "esqueci" em análise ou ficou de fora
//   pela regra de horário (já contou no evento que causou isso)
//
// A sequência soma os "no horário" seguidos; atraso ou falta zera. A conta de
// recuperação é espelhada em SQL (`maybe_award_recovery`).

import type { PenaltyTier } from './points.ts'

export type CommitmentOutcome = 'on_time' | 'late' | 'excused' | 'absent' | 'neutral'

export type Commitment = {
  eventId: string
  kind: string
  startsAt: string
  endsAt: string | null
  /** chegada da equipe (ou início, se não tiver) */
  callAt: string
  soundcheckAt: string | null
  arrivedAt: string | null
  lateMinutes: number | null
  benched: boolean
  justificationApproved: boolean
  requestPending: boolean
}

export type Tolerances = { service: number; rehearsal: number; other: number }

export function toleranceFor(kind: string, t: Tolerances): number {
  return kind === 'service' ? t.service : kind === 'rehearsal' ? t.rehearsal : t.other
}

/** Fim do evento (sem `ends_at`, considera 2 h depois do início). */
export function commitmentEnd(c: Pick<Commitment, 'startsAt' | 'endsAt'>): number {
  return c.endsAt ? Date.parse(c.endsAt) : Date.parse(c.startsAt) + 2 * 3_600_000
}

export function commitmentOutcome(
  c: Commitment,
  tolerances: Tolerances,
  now: Date | string | number,
): CommitmentOutcome {
  const tol = toleranceFor(c.kind, tolerances)
  if (c.arrivedAt) {
    if ((c.lateMinutes ?? 0) <= tol) return 'on_time'
    return c.justificationApproved ? 'excused' : 'late'
  }
  if (new Date(now).getTime() < commitmentEnd(c)) return 'neutral'
  if (c.justificationApproved) return 'excused'
  if (c.requestPending || c.benched) return 'neutral'
  return 'absent'
}

export type Scored = Commitment & { outcome: CommitmentOutcome }

export function scoreCommitments(
  list: Commitment[],
  tolerances: Tolerances,
  now: Date | string | number,
): Scored[] {
  return [...list]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .map((c) => ({ ...c, outcome: commitmentOutcome(c, tolerances, now) }))
}

/** Sequência atual e a maior já feita (lista em ordem cronológica). */
export function streaks(scored: Pick<Scored, 'outcome'>[]): { current: number; best: number } {
  let current = 0
  let best = 0
  for (const c of scored) {
    if (c.outcome === 'on_time') {
      current += 1
      best = Math.max(best, current)
    } else if (c.outcome === 'late' || c.outcome === 'absent') {
      current = 0
    }
  }
  return { current, best }
}

export type Tally = {
  commitments: number
  onTime: number
  late: number
  absent: number
  excused: number
}

export function tally(scored: Pick<Scored, 'outcome'>[]): Tally {
  const t: Tally = { commitments: 0, onTime: 0, late: 0, absent: 0, excused: 0 }
  for (const c of scored) {
    if (c.outcome === 'neutral') continue
    t.commitments += 1
    if (c.outcome === 'on_time') t.onTime += 1
    else if (c.outcome === 'late') t.late += 1
    else if (c.outcome === 'absent') t.absent += 1
    else t.excused += 1
  }
  return t
}

// ---------------------------------------------------------------------------
// Selos
// ---------------------------------------------------------------------------

export type BadgeId =
  | 'first'
  | 'streak5'
  | 'streak10'
  | 'streak25'
  | 'early'
  | 'soundcheck'
  | 'rehearsals'
  | 'reliable'
  | 'perfect_cycle'

export type Badge = {
  id: BadgeId
  title: string
  description: string
  earned: boolean
  current: number
  target: number
}

/** Chegou pelo menos 10 min antes do horário de chegada. */
const EARLY_MIN = 10

export function badges(params: {
  scored: Scored[]
  /** saldos finais dos ciclos já fechados */
  closedCycles: { balance: number }[]
  startingPoints: number
}): Badge[] {
  const { scored, closedCycles, startingPoints } = params
  const { best } = streaks(scored)
  const presences = scored.filter((c) => c.arrivedAt).length
  const early = scored.filter(
    (c) => c.arrivedAt && Date.parse(c.arrivedAt) <= Date.parse(c.callAt) - EARLY_MIN * 60_000,
  ).length
  const soundcheck = scored.filter(
    (c) =>
      c.kind === 'service' &&
      c.soundcheckAt &&
      c.arrivedAt &&
      Date.parse(c.arrivedAt) <= Date.parse(c.soundcheckAt),
  ).length
  const rehearsals = scored.filter((c) => c.kind === 'rehearsal' && c.outcome === 'on_time').length
  // compromissos desde a última falta sem aviso
  let sinceAbsence = 0
  for (const c of scored) {
    if (c.outcome === 'absent') sinceAbsence = 0
    else if (c.outcome !== 'neutral') sinceAbsence += 1
  }
  const perfect = closedCycles.filter((c) => c.balance >= startingPoints).length

  const make = (
    id: BadgeId,
    title: string,
    description: string,
    current: number,
    target: number,
  ): Badge => ({
    id,
    title,
    description,
    earned: current >= target,
    current: Math.min(current, target),
    target,
  })

  return [
    make('first', 'Primeira presença', 'Registrou a presença pela primeira vez', presences, 1),
    make('streak5', 'Pontual', '5 compromissos seguidos no horário', best, 5),
    make('streak10', 'Relógio', '10 compromissos seguidos no horário', best, 10),
    make('streak25', 'Inabalável', '25 compromissos seguidos no horário', best, 25),
    make('early', 'Madrugador', `Chegou ${EARLY_MIN} min antes da chegada 5 vezes`, early, 5),
    make(
      'soundcheck',
      'Passagem de som',
      'Chegou até a passagem de som em 5 cultos',
      soundcheck,
      5,
    ),
    make('rehearsals', 'Ensaio em dia', '10 ensaios no horário', rehearsals, 10),
    make(
      'reliable',
      'Sempre avisa',
      '10 compromissos seguidos sem falta sem aviso',
      sinceAbsence,
      10,
    ),
    make('perfect_cycle', 'Ciclo perfeito', 'Fechou um ciclo sem perder pontos', perfect, 1),
  ]
}

/** O selo ainda não conquistado mais perto de sair (para "faltam N para …"). */
export function nextBadge(list: Badge[]): Badge | null {
  const open = list.filter((b) => !b.earned && b.current > 0)
  if (open.length === 0) return list.find((b) => !b.earned) ?? null
  return open.sort((a, b) => a.target - a.current - (b.target - b.current))[0] ?? null
}

// ---------------------------------------------------------------------------
// Margem até o mínimo
// ---------------------------------------------------------------------------

export type SafetyMargin =
  | { above: true; points: number; lates: number; absences: number; latePoints: number }
  | { above: false; missing: number }

export function safetyMargin(params: {
  balance: number
  minPoints: number
  lateTiers: PenaltyTier[]
  absencePenalty: number
}): SafetyMargin {
  const { balance, minPoints, lateTiers, absencePenalty } = params
  if (balance < minPoints) return { above: false, missing: minPoints - balance }
  const points = balance - minPoints
  const latePoints = lateTiers[0]?.points ?? 0
  return {
    above: true,
    points,
    latePoints,
    lates: latePoints > 0 ? Math.floor(points / latePoints) : Infinity,
    absences: absencePenalty > 0 ? Math.floor(points / absencePenalty) : Infinity,
  }
}

// ---------------------------------------------------------------------------
// Recuperação de pontos (opcional, por ministério)
// ---------------------------------------------------------------------------

export type RecoveryRule = { enabled: boolean; every: number; points: number }

/**
 * Quantos "no horário" já contam para a próxima recuperação. Conta os
 * compromissos do ciclo depois do último desconto ou da última recuperação
 * (o que for mais recente). Mesma regra de `maybe_award_recovery` (SQL).
 */
export function recoveryProgress(params: {
  rule: RecoveryRule
  balance: number
  startingPoints: number
  /** compromissos do ciclo, já pontuados */
  scored: Pick<Scored, 'startsAt' | 'outcome'>[]
  /** lançamentos do ciclo; `at` = início do evento ou data do lançamento */
  ledger: { delta: number; reason: string; at: string }[]
}): { active: false } | { active: true; count: number; every: number; points: number } {
  const { rule, balance, startingPoints, scored, ledger } = params
  if (!rule.enabled || balance >= startingPoints) return { active: false }
  const anchor = ledger
    .filter((e) => e.reason === 'recovery' || (e.delta < 0 && e.reason !== 'cycle_start'))
    .reduce((max, e) => Math.max(max, Date.parse(e.at)), -Infinity)
  const count = scored.filter(
    (c) => c.outcome === 'on_time' && Date.parse(c.startsAt) > anchor,
  ).length
  return {
    active: true,
    count: Math.min(count, rule.every),
    every: rule.every,
    points: Math.min(rule.points, startingPoints - balance),
  }
}

/** Percentual no horário (arredondado); null sem compromissos. */
export function onTimeRate(t: Pick<Tally, 'onTime' | 'late' | 'absent'>): number | null {
  const total = t.onTime + t.late + t.absent
  return total === 0 ? null : Math.round((t.onTime / total) * 100)
}
