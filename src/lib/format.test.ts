import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime, formatEventDate, initials, relativeDays } from '@/lib/format'

describe('format', () => {
  it('exibe data/hora no fuso de São Paulo (UTC−3)', () => {
    // 22:30 UTC = 19:30 em São Paulo
    expect(formatDateTime('2026-10-24T22:30:00Z')).toContain('19:30')
  })

  it('formata o evento como nos protótipos', () => {
    expect(formatEventDate('2026-10-24T22:30:00Z')).toBe('Sáb, 24 out · 19:30')
  })

  it('não desloca datas de calendário por causa do fuso', () => {
    expect(formatDate('2026-10-23')).toBe('23/10/2026')
  })

  it('gera iniciais', () => {
    expect(initials('Ana Clara Souza')).toBe('AS')
    expect(initials('rafael')).toBe('R')
    expect(initials('  ')).toBe('?')
  })

  it('descreve dias relativos no fuso de São Paulo', () => {
    const now = new Date('2026-10-18T15:00:00Z')
    expect(relativeDays('2026-10-18T23:00:00Z', now)).toBe('hoje')
    // 01:00 UTC do dia 19 ainda é dia 18 em São Paulo
    expect(relativeDays('2026-10-19T01:00:00Z', now)).toBe('hoje')
    expect(relativeDays('2026-10-19T15:00:00Z', now)).toBe('amanhã')
    expect(relativeDays('2026-10-24T22:30:00Z', now)).toBe('em 6 dias')
  })
})
