import { describe, expect, it } from 'vitest'

import { describeRule, reminderFireAt } from './reminders.ts'

// Domingo 01/11/2026 19h em São Paulo (22h UTC), chegada 18h30
const service = { starts_at: '2026-11-01T22:00:00Z', arrive_at: '2026-11-01T21:30:00Z' }
// Quinta 29/10/2026 19h30, chegada 19h10
const rehearsal = { starts_at: '2026-10-29T22:30:00Z', arrive_at: '2026-10-29T22:10:00Z' }

const iso = (d: Date | null) => d?.toISOString() ?? null

describe('reminderFireAt', () => {
  it('dia da semana: a segunda anterior ao evento', () => {
    expect(iso(reminderFireAt({ timing: 'weekday', weekday: 1, at_time: '09:00' }, service))).toBe(
      '2026-10-26T12:00:00.000Z',
    )
    expect(
      iso(reminderFireAt({ timing: 'weekday', weekday: 1, at_time: '09:00' }, rehearsal)),
    ).toBe('2026-10-26T12:00:00.000Z')
  })

  it('dia da semana igual ao do evento = no próprio dia', () => {
    expect(iso(reminderFireAt({ timing: 'weekday', weekday: 0, at_time: '08:30' }, service))).toBe(
      '2026-11-01T11:30:00.000Z',
    )
  })

  it('dias antes e no dia', () => {
    expect(
      iso(reminderFireAt({ timing: 'days_before', days_before: 0, at_time: '09:00' }, service)),
    ).toBe('2026-11-01T12:00:00.000Z')
    expect(
      iso(reminderFireAt({ timing: 'days_before', days_before: 2, at_time: '18:00' }, service)),
    ).toBe('2026-10-30T21:00:00.000Z')
  })

  it('minutos antes da chegada (ou do início, sem chegada)', () => {
    expect(iso(reminderFireAt({ timing: 'minutes_before', minutes_before: 60 }, service))).toBe(
      '2026-11-01T20:30:00.000Z',
    )
    expect(
      iso(
        reminderFireAt(
          { timing: 'minutes_before', minutes_before: 30 },
          { starts_at: service.starts_at },
        ),
      ),
    ).toBe('2026-11-01T21:30:00.000Z')
  })

  it('não avisa na hora da chegada ou depois', () => {
    expect(
      reminderFireAt({ timing: 'days_before', days_before: 0, at_time: '18:30' }, service),
    ).toBeNull()
    expect(reminderFireAt({ timing: 'minutes_before', minutes_before: 0 }, service)).toBeNull()
  })
})

describe('describeRule', () => {
  it('descreve em português', () => {
    expect(describeRule({ timing: 'weekday', weekday: 1, at_time: '09:00' })).toBe(
      'Na segunda antes, às 9h',
    )
    expect(describeRule({ timing: 'weekday', weekday: 6, at_time: '10:30' })).toBe(
      'No sábado antes, às 10h30',
    )
    expect(describeRule({ timing: 'days_before', days_before: 0, at_time: '09:00' })).toBe(
      'No dia, às 9h',
    )
    expect(describeRule({ timing: 'days_before', days_before: 1, at_time: '20:00' })).toBe(
      '1 dia antes, às 20h',
    )
    expect(describeRule({ timing: 'minutes_before', minutes_before: 60 })).toBe(
      '1 h antes da chegada',
    )
    expect(describeRule({ timing: 'minutes_before', minutes_before: 90 })).toBe(
      '1 h 30 min antes da chegada',
    )
    expect(describeRule({ timing: 'minutes_before', minutes_before: 30 })).toBe(
      '30 min antes da chegada',
    )
  })
})
