import { describe, expect, it } from 'vitest'

import {
  badges,
  commitmentOutcome,
  nextBadge,
  onTimeRate,
  recoveryProgress,
  marginAlert,
  scoreCommitments,
  streaks,
  tally,
  type Commitment,
} from './gamification.ts'

const tol = { service: 10, rehearsal: 10, other: 10 }
const NOW = '2027-12-31T12:00:00Z'

let n = 0
function c(partial: Partial<Commitment> = {}): Commitment {
  n += 1
  const day = (h: number) => new Date(Date.UTC(2026, 9, 1 + n, h, 0)).toISOString()
  return {
    eventId: `e${n}`,
    kind: 'service',
    startsAt: day(22),
    endsAt: null,
    callAt: day(21),
    soundcheckAt: null,
    arrivedAt: day(21),
    lateMinutes: 0,
    benched: false,
    justificationApproved: false,
    requestPending: false,
    ...partial,
  }
}

describe('commitmentOutcome', () => {
  it('dentro da tolerância é no horário; depois, atraso', () => {
    expect(commitmentOutcome(c({ lateMinutes: 10 }), tol, NOW)).toBe('on_time')
    expect(commitmentOutcome(c({ lateMinutes: 11 }), tol, NOW)).toBe('late')
  })
  it('aviso aprovado não pune', () => {
    expect(commitmentOutcome(c({ lateMinutes: 30, justificationApproved: true }), tol, NOW)).toBe(
      'excused',
    )
    expect(
      commitmentOutcome(
        c({ arrivedAt: null, lateMinutes: null, justificationApproved: true }),
        tol,
        NOW,
      ),
    ).toBe('excused')
  })
  it('sem registro: falta só depois do fim; esqueci pendente e fora da escala ficam neutros', () => {
    const missing = { arrivedAt: null, lateMinutes: null }
    expect(commitmentOutcome(c(missing), tol, NOW)).toBe('absent')
    expect(commitmentOutcome(c({ ...missing, requestPending: true }), tol, NOW)).toBe('neutral')
    expect(commitmentOutcome(c({ ...missing, benched: true }), tol, NOW)).toBe('neutral')
    expect(commitmentOutcome(c(missing), tol, '2020-01-01T00:00:00Z')).toBe('neutral')
  })
  it('usa a tolerância do tipo de evento', () => {
    const t = { service: 10, rehearsal: 5, other: 10 }
    expect(commitmentOutcome(c({ kind: 'rehearsal', lateMinutes: 7 }), t, NOW)).toBe('late')
  })
})

describe('streaks e tally', () => {
  it('atraso e falta zeram; aviso aprovado e neutros não', () => {
    const list = scoreCommitments(
      [
        c(),
        c(),
        c({ lateMinutes: 15 }),
        c(),
        c({ arrivedAt: null, justificationApproved: true }),
        c(),
        c(),
        c({ arrivedAt: null, requestPending: true }),
        c(),
      ],
      tol,
      NOW,
    )
    expect(streaks(list)).toEqual({ current: 4, best: 4 })
    expect(tally(list)).toEqual({ commitments: 8, onTime: 6, late: 1, absent: 0, excused: 1 })
    expect(onTimeRate(tally(list))).toBe(86)
  })
  it('a maior sequência fica guardada', () => {
    const list = scoreCommitments([c(), c(), c(), c({ arrivedAt: null }), c()], tol, NOW)
    expect(streaks(list)).toEqual({ current: 1, best: 3 })
  })
  it('sem compromissos, sem percentual', () => {
    expect(onTimeRate({ onTime: 0, late: 0, absent: 0 })).toBeNull()
  })
})

describe('badges', () => {
  it('conta progresso e conquista', () => {
    const list = scoreCommitments(
      [
        c({ arrivedAt: '2026-01-01T21:15:00Z', callAt: '2026-01-01T21:30:00Z' }),
        c({ kind: 'rehearsal' }),
        c({ soundcheckAt: '2026-01-03T21:00:00Z', arrivedAt: '2026-01-03T20:55:00Z' }),
        c(),
        c(),
      ],
      tol,
      NOW,
    )
    const b = Object.fromEntries(
      badges({ scored: list, closedCycles: [{ balance: 100 }], startingPoints: 100 }).map((x) => [
        x.id,
        x,
      ]),
    )
    expect(b.first?.earned).toBe(true)
    expect(b.streak5).toMatchObject({ earned: true, current: 5 })
    expect(b.streak10).toMatchObject({ earned: false, current: 5, target: 10 })
    expect(b.early?.current).toBe(2)
    expect(b.soundcheck?.current).toBe(1)
    expect(b.rehearsals?.current).toBe(1)
    expect(b.reliable?.current).toBe(5)
    expect(b.perfect_cycle?.earned).toBe(true)
  })
  it('falta sem aviso zera o "Sempre avisa"', () => {
    const list = scoreCommitments([c(), c(), c({ arrivedAt: null }), c()], tol, NOW)
    const reliable = badges({ scored: list, closedCycles: [], startingPoints: 100 }).find(
      (x) => x.id === 'reliable',
    )
    expect(reliable?.current).toBe(1)
  })
  it('próximo selo é o mais perto de sair', () => {
    const list = badges({
      scored: scoreCommitments([c(), c(), c(), c()], tol, NOW),
      closedCycles: [],
      startingPoints: 100,
    })
    expect(nextBadge(list)?.id).toBe('streak5')
  })
})

describe('marginAlert', () => {
  const tiers = [
    { upToMin: 20, points: 5 },
    { upToMin: null, points: 10 },
  ]
  it('acima com folga: nada', () => {
    expect(marginAlert({ balance: 85, minPoints: 70, lateTiers: tiers })).toBeNull()
    expect(marginAlert({ balance: 75, minPoints: 70, lateTiers: tiers })).toBeNull()
  })
  it('no limite: o próximo atraso deixa abaixo', () => {
    expect(marginAlert({ balance: 74, minPoints: 70, lateTiers: tiers })).toEqual({ kind: 'edge' })
    expect(marginAlert({ balance: 70, minPoints: 70, lateTiers: tiers })).toEqual({ kind: 'edge' })
  })
  it('abaixo: quanto falta', () => {
    expect(marginAlert({ balance: 60, minPoints: 70, lateTiers: tiers })).toEqual({
      kind: 'below',
      missing: 10,
    })
  })
})

describe('recoveryProgress', () => {
  const rule = { enabled: true, every: 5, points: 5 }
  const at = (d: string) => `2026-11-${d}T22:00:00Z`
  const scored = (days: string[]) =>
    days.map((d) => ({ startsAt: at(d), outcome: 'on_time' as const }))

  it('desligada ou saldo cheio: nada', () => {
    expect(
      recoveryProgress({
        rule: { ...rule, enabled: false },
        balance: 90,
        startingPoints: 100,
        scored: [],
        ledger: [],
      }),
    ).toEqual({ active: false })
    expect(
      recoveryProgress({ rule, balance: 100, startingPoints: 100, scored: [], ledger: [] }),
    ).toEqual({ active: false })
  })
  it('conta só depois do último desconto ou recuperação', () => {
    const r = recoveryProgress({
      rule,
      balance: 95,
      startingPoints: 100,
      scored: scored(['01', '02', '04', '05']),
      ledger: [
        { delta: 100, reason: 'cycle_start', at: '2026-10-01T00:00:00Z' },
        { delta: -10, reason: 'late', at: at('03') },
        { delta: 5, reason: 'recovery', at: at('04') },
      ],
    })
    expect(r).toEqual({ active: true, count: 1, every: 5, points: 5 })
  })
  it('não passa do teto do ciclo', () => {
    const r = recoveryProgress({ rule, balance: 98, startingPoints: 100, scored: [], ledger: [] })
    expect(r).toMatchObject({ points: 2 })
  })
})
