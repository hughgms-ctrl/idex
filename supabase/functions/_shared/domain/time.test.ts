import { describe, expect, it } from 'vitest'

import {
  addDaysToKey,
  addMonths,
  localDateKey,
  localParts,
  monthRange,
  zonedToUtc,
} from './time.ts'

describe('time', () => {
  it('converte horário de São Paulo para UTC (UTC−3)', () => {
    expect(zonedToUtc(2026, 10, 25, 19, 0).toISOString()).toBe('2026-10-25T22:00:00.000Z')
  })

  it('usa o dia no fuso da igreja', () => {
    // 01:00 UTC do dia 26 ainda é dia 25 em São Paulo
    expect(localDateKey('2026-10-26T01:00:00Z')).toBe('2026-10-25')
    expect(localParts('2026-10-26T01:00:00Z').weekday).toBe(0) // domingo
  })

  it('respeita horário de verão de outros fusos', () => {
    // Nova York: 9h de 1º de julho = 13h UTC (EDT); 9h de 1º de dezembro = 14h UTC (EST)
    expect(zonedToUtc(2026, 7, 1, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-07-01T13:00:00.000Z',
    )
    expect(zonedToUtc(2026, 12, 1, 9, 0, 'America/New_York').toISOString()).toBe(
      '2026-12-01T14:00:00.000Z',
    )
  })

  it('calcula limites do mês no fuso', () => {
    const { start, end } = monthRange(2026, 12)
    expect(start.toISOString()).toBe('2026-12-01T03:00:00.000Z')
    expect(end.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })

  it('soma dias e meses no calendário', () => {
    expect(addDaysToKey('2026-12-30', 3)).toBe('2027-01-02')
    expect(addMonths(2026, 11, 2)).toEqual({ year: 2027, month: 1 })
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })
})
