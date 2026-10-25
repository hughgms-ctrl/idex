import { describe, expect, it } from 'vitest'

import { addMonthsToKey, cycleEnd, cycleProblem, nextCycle, wholeMonths } from './cycles.ts'

describe('ciclo de pontos', () => {
  it('3 e 6 meses a partir do dia escolhido', () => {
    expect(cycleEnd('2026-11-01', 3)).toBe('2027-01-31')
    expect(cycleEnd('2026-11-01', 6)).toBe('2027-04-30')
    expect(cycleEnd('2026-10-23', 3)).toBe('2027-01-22')
  })

  it('fim de mês como o Postgres', () => {
    expect(addMonthsToKey('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonthsToKey('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('o próximo ciclo começa no dia seguinte', () => {
    expect(nextCycle('2027-01-31', 3)).toEqual({ startsOn: '2027-02-01', endsOn: '2027-04-30' })
    expect(nextCycle('2026-12-31', 6)).toEqual({ startsOn: '2027-01-01', endsOn: '2027-06-30' })
  })

  it('reconhece ciclo de meses inteiros', () => {
    expect(wholeMonths('2026-11-01', '2027-01-31')).toBe(3)
    expect(wholeMonths('2026-11-01', '2027-01-15')).toBeNull()
  })

  it('valida as datas', () => {
    const base = { startsOn: '2026-11-01', endsOn: '2027-01-31', today: '2026-10-25' }
    expect(cycleProblem(base)).toBeNull()
    expect(cycleProblem({ ...base, endsOn: '2026-10-01' })).toBe(
      'O fim precisa ser depois do início.',
    )
    expect(cycleProblem({ ...base, startsOn: '2026-01-01', endsOn: '2026-03-31' })).toBe(
      'O fim do ciclo atual não pode ficar no passado.',
    )
    expect(cycleProblem({ ...base, endsOn: '2029-01-31' })).toBe(
      'O ciclo pode ter no máximo 24 meses.',
    )
    expect(cycleProblem({ ...base, previousEnd: '2026-11-15' })).toBe(
      'O ciclo anterior foi até 15/11/2026: comece depois disso.',
    )
  })
})
