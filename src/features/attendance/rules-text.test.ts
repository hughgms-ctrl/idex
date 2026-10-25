import { describe, expect, it } from 'vitest'

import { describeRules, type RulesSettings } from './rules-text'

const base: RulesSettings = {
  cycle_starting_points: 100,
  cycle_min_points: 70,
  late_penalty_tiers: [
    { upToMin: 20, points: 5 },
    { upToMin: null, points: 10 },
  ],
  absence_penalty: 20,
  service_arrival_minutes: 80,
  service_tolerance_min: 10,
  service_late_consequence: 'no_play',
  rehearsal_enabled: true,
  rehearsal_arrival_minutes: 25,
  rehearsal_tolerance_min: 10,
  rehearsal_late_consequence: 'out_rehearsal_and_service',
  rehearsal_forgot_policy: 'out_until_approved',
  rehearsal_excused_policy: 'can_play',
  checkin_request_deadline_hours: 48,
  checkin_request_limit_per_cycle: 3,
  recovery_enabled: false,
  recovery_every: 5,
  recovery_points: 5,
}

const text = (s: RulesSettings) =>
  describeRules(s)
    .map((g) => `${g.title}: ${g.lines.join(' ')}`)
    .join('\n')

describe('describeRules', () => {
  it('culto: chegada, tolerância por tipo, faixas e consequência', () => {
    const t = text(base)
    expect(t).toContain('chegada da equipe é 80 min antes do início')
    expect(t).toContain(
      'Tolerância: 10 min. Passou disso, conta o atraso inteiro: até 20 min: −5 · mais de 20 min: −10.',
    )
    expect(t).toContain('não toca naquele culto')
  })
  it('ensaio: regras de quem fica de fora', () => {
    const t = text(base)
    expect(t).toContain('fica fora do ensaio e do culto')
    expect(t).toContain('Fica fora do culto até o líder aprovar')
    expect(t).toContain('com aviso aprovado: continua no culto')
  })
  it('sem ensaio e sem consequência: não fala delas', () => {
    const t = text({ ...base, rehearsal_enabled: false, service_late_consequence: 'points' })
    expect(t).not.toContain('Ensaio')
    expect(t).not.toContain('não toca')
  })
  it('recuperação só quando ligada', () => {
    expect(text(base)).not.toContain('Recuperar')
    expect(text({ ...base, recovery_enabled: true })).toContain(
      'A cada 5 presenças seguidas no horário depois de um desconto, você recupera +5',
    )
  })
})
