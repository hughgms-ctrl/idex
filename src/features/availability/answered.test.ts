import { describe, expect, it } from 'vitest'

import { latestChange, noticeOutdated, writtenBeforeChange } from './answered'
import { formatShortDateTime } from '@/lib/format'

describe('resposta escrita antes da remarcação', () => {
  it('avisa quando o evento mudou depois da resposta', () => {
    expect(writtenBeforeChange('2026-10-20T12:00:00Z', [null, '2026-10-25T09:00:00Z'])).toBe(true)
  })
  it('não avisa quando respondeu depois, sem remarcação ou sem resposta', () => {
    expect(writtenBeforeChange('2026-10-26T12:00:00Z', ['2026-10-25T09:00:00Z'])).toBe(false)
    expect(writtenBeforeChange('2026-10-26T12:00:00Z', [null, undefined])).toBe(false)
    expect(writtenBeforeChange(undefined, ['2026-10-25T09:00:00Z'])).toBe(false)
  })
  it('pega a remarcação mais recente', () => {
    expect(latestChange([null, '2026-10-25T09:00:00Z', '2026-10-27T09:00:00Z'])).toBe(
      '2026-10-27T09:00:00Z',
    )
    expect(latestChange([null])).toBeNull()
  })
  it('mostra a data no fuso de São Paulo', () => {
    expect(formatShortDateTime('2026-10-28T17:32:00Z')).toBe('28/10 às 14:32')
    expect(formatShortDateTime('2026-10-29T02:05:00Z')).toBe('28/10 às 23:05')
  })
})

describe('aviso de falta enviado antes da remarcação', () => {
  const moved = { rescheduled_at: '2026-11-02T13:10:00Z' }
  it('pendente e enviado antes: desatualizado', () => {
    expect(noticeOutdated({ created_at: '2026-11-02T12:46:00Z', status: 'pending' }, moved)).toBe(
      true,
    )
  })
  it('confirmado depois da remarcação, já analisado ou sem remarcação: ok', () => {
    expect(
      noticeOutdated(
        { created_at: '2026-11-02T12:46:00Z', reconfirmed_at: '2026-11-02T14:00:00Z' },
        moved,
      ),
    ).toBe(false)
    expect(noticeOutdated({ created_at: '2026-11-02T12:46:00Z', status: 'approved' }, moved)).toBe(
      false,
    )
    expect(noticeOutdated({ created_at: '2026-11-02T12:46:00Z' }, { rescheduled_at: null })).toBe(
      false,
    )
  })
})
