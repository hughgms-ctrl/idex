import { describe, expect, it } from 'vitest'

import {
  attendanceOutcome,
  balance,
  checkCheckinRequest,
  DEFAULT_RULES as R,
  isEligibleAtClose,
  lateConsequence,
  lateMinutes,
  latePenalty,
  nextCycleRange,
  normalizeTiers,
  reviewOutcome,
  rulesFromSettings,
} from './points.ts'

const START = '2026-10-24T22:30:00Z' // sábado 19:30 em SP
const at = (min: number) => new Date(new Date(START).getTime() + min * 60_000).toISOString()

describe('atraso', () => {
  it('conta minutos inteiros de atraso', () => {
    expect(lateMinutes(START, at(-5))).toBe(0)
    expect(lateMinutes(START, at(0))).toBe(0)
    expect(lateMinutes(START, at(10.9))).toBe(10)
  })

  it('aplica tolerância e faixas (até 20 min −5; acima −10)', () => {
    expect(latePenalty(10, R)).toBe(0)
    expect(latePenalty(11, R)).toBe(5)
    expect(latePenalty(20, R)).toBe(5)
    expect(latePenalty(21, R)).toBe(10)
    expect(latePenalty(90, R)).toBe(10)
  })

  it('faixas configuráveis, em qualquer ordem e com sinal', () => {
    const tiers = normalizeTiers([
      { upToMin: null, points: -15 },
      { upToMin: 15, points: 3 },
      { upToMin: 30, points: 8 },
    ])
    const rules = { ...R, lateToleranceMin: 5, lateTiers: tiers }
    expect(latePenalty(5, rules)).toBe(0)
    expect(latePenalty(12, rules)).toBe(3)
    expect(latePenalty(25, rules)).toBe(8)
    expect(latePenalty(31, rules)).toBe(15)
    expect(normalizeTiers('lixo')).toEqual(R.lateTiers)
  })
})

describe('presença', () => {
  it('no horário, atrasado, falta', () => {
    expect(
      attendanceOutcome({ eventStart: START, arrivedAt: at(8), justified: false, rules: R }),
    ).toEqual({
      kind: 'on_time',
      lateMinutes: 8,
      delta: 0,
    })
    expect(
      attendanceOutcome({ eventStart: START, arrivedAt: at(12), justified: false, rules: R }),
    ).toEqual({
      kind: 'late',
      lateMinutes: 12,
      delta: -5,
    })
    expect(
      attendanceOutcome({ eventStart: START, arrivedAt: null, justified: false, rules: R }),
    ).toEqual({
      kind: 'absent',
      lateMinutes: 0,
      delta: -20,
    })
  })

  it('justificativa aprovada zera atraso e falta', () => {
    expect(
      attendanceOutcome({ eventStart: START, arrivedAt: at(40), justified: true, rules: R }).delta,
    ).toBe(0)
    expect(
      attendanceOutcome({ eventStart: START, arrivedAt: null, justified: true, rules: R }),
    ).toMatchObject({
      kind: 'justified',
      delta: 0,
    })
  })

  it('saldo e elegibilidade no fechamento', () => {
    const entries = [{ delta: 100 }, { delta: -10 }, { delta: -20 }]
    expect(balance(entries)).toBe(70)
    expect(isEligibleAtClose(70, R)).toBe(true)
    expect(isEligibleAtClose(69, R)).toBe(false)
  })

  it('quem entra no meio do ciclo começa com saldo cheio', () => {
    expect(balance([{ delta: R.startingPoints }])).toBe(100)
  })

  it('lê as regras da tabela de configurações', () => {
    const rules = rulesFromSettings({
      late_tolerance_min: 15,
      late_penalty_tiers: [{ upToMin: 30, points: 2 }],
      absence_penalty: 30,
      cycle_starting_points: 50,
      cycle_min_points: 40,
      checkin_request_limit_per_cycle: 2,
      checkin_request_deadline_hours: 24,
    })
    expect(rules).toMatchObject({
      lateToleranceMin: 15,
      absencePenalty: 30,
      minPoints: 40,
      requestDeadlineHours: 24,
    })
    expect(latePenalty(16, rules)).toBe(2)
  })
})

describe('esqueci de registrar', () => {
  const END = at(120)
  const base = {
    eventStart: START,
    eventEnd: END,
    declaredArrivedAt: at(5),
    requestsInCycle: 0,
    rules: R,
  }

  it('só depois do início e até 48h após o fim', () => {
    expect(checkCheckinRequest({ ...base, now: at(-1) })).toEqual({
      ok: false,
      reason: 'before_event',
    })
    expect(checkCheckinRequest({ ...base, now: at(60) })).toEqual({ ok: true, overLimit: false })
    expect(checkCheckinRequest({ ...base, now: at(120 + 48 * 60) })).toEqual({
      ok: true,
      overLimit: false,
    })
    expect(checkCheckinRequest({ ...base, now: at(120 + 48 * 60 + 1) })).toEqual({
      ok: false,
      reason: 'deadline_passed',
    })
  })

  it('horário declarado precisa fazer sentido', () => {
    expect(checkCheckinRequest({ ...base, now: at(60), declaredArrivedAt: at(-200) })).toEqual({
      ok: false,
      reason: 'declared_out_of_range',
    })
    expect(checkCheckinRequest({ ...base, now: at(130), declaredArrivedAt: at(125) })).toEqual({
      ok: false,
      reason: 'declared_out_of_range',
    })
  })

  it('acima do limite do ciclo aceita mas avisa o líder', () => {
    expect(checkCheckinRequest({ ...base, now: at(60), requestsInCycle: 3 })).toEqual({
      ok: true,
      overLimit: true,
    })
    expect(checkCheckinRequest({ ...base, now: at(60), requestsInCycle: 2 })).toEqual({
      ok: true,
      overLimit: false,
    })
  })

  it('revisão do líder: aprova, ajusta horário ou recusa (vira falta)', () => {
    const p = { eventStart: START, declaredArrivedAt: at(5), justified: false, rules: R }
    expect(reviewOutcome({ ...p, review: { decision: 'approve' } })).toMatchObject({
      kind: 'on_time',
      delta: 0,
    })
    expect(
      reviewOutcome({ ...p, review: { decision: 'adjust', arrivedAt: at(25) } }),
    ).toMatchObject({
      kind: 'late',
      lateMinutes: 25,
      delta: -10,
      arrivedAt: at(25),
    })
    expect(reviewOutcome({ ...p, review: { decision: 'reject' } })).toMatchObject({
      kind: 'absent',
      delta: -20,
      arrivedAt: null,
    })
  })
})

describe('ciclo', () => {
  it('próximo ciclo começa no dia seguinte e dura N meses', () => {
    expect(nextCycleRange('2027-01-22', 3)).toEqual({
      startsOn: '2027-01-23',
      endsOn: '2027-04-22',
    })
    expect(nextCycleRange('2026-12-31', 3)).toEqual({
      startsOn: '2027-01-01',
      endsOn: '2027-03-31',
    })
  })
})

describe('regras por tipo de evento', () => {
  const row = {
    late_tolerance_min: 10,
    service_tolerance_min: 10,
    rehearsal_tolerance_min: 5,
    late_penalty_tiers: [
      { upToMin: 20, points: 5 },
      { upToMin: null, points: 10 },
    ],
    absence_penalty: 20,
    cycle_starting_points: 100,
    cycle_min_points: 70,
    checkin_request_limit_per_cycle: 3,
    checkin_request_deadline_hours: 48,
  }

  it('cada tipo usa a sua tolerância', () => {
    expect(rulesFromSettings(row, 'rehearsal').lateToleranceMin).toBe(5)
    expect(rulesFromSettings(row, 'service').lateToleranceMin).toBe(10)
    expect(
      rulesFromSettings({ ...row, service_tolerance_min: null }, 'service').lateToleranceMin,
    ).toBe(10)
  })

  it('atraso no ensaio pode tirar do ensaio e do culto', () => {
    const rule = {
      rehearsal_late_consequence: 'out_rehearsal_and_service',
      service_late_consequence: 'no_play',
    }
    expect(
      lateConsequence({ kind: 'rehearsal', beyondTolerance: true, linkedToService: true, rule }),
    ).toBe('event_and_service')
    expect(
      lateConsequence({ kind: 'rehearsal', beyondTolerance: true, linkedToService: false, rule }),
    ).toBe('event')
    expect(
      lateConsequence({ kind: 'rehearsal', beyondTolerance: false, linkedToService: true, rule }),
    ).toBe('none')
    expect(
      lateConsequence({ kind: 'service', beyondTolerance: true, linkedToService: false, rule }),
    ).toBe('event')
    expect(
      lateConsequence({ kind: 'service', beyondTolerance: true, linkedToService: false, rule: {} }),
    ).toBe('none')
  })
})
