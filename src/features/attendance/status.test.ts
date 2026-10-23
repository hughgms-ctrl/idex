import { describe, expect, it } from 'vitest'

import { liveStatus, type LiveData } from '@/features/attendance/status'

const empty: LiveData = { checkins: [], justifications: [], requests: [], ledger: [] }
const T = '2026-10-24T22:40:00Z'

describe('painel ao vivo', () => {
  it('no horário, atrasado com desconto, justificado', () => {
    expect(
      liveStatus({
        memberId: 'a',
        data: { ...empty, checkins: [{ ministry_member_id: 'a', arrived_at: T, late_minutes: 8 }] },
        eventEnded: false,
        toleranceMin: 10,
      }).tone,
    ).toBe('ok')
    expect(
      liveStatus({
        memberId: 'a',
        data: {
          ...empty,
          checkins: [{ ministry_member_id: 'a', arrived_at: T, late_minutes: 25 }],
          ledger: [{ ministry_member_id: 'a', delta: -10, reason: 'late' }],
        },
        eventEnded: false,
        toleranceMin: 10,
      }).label,
    ).toBe('ATRASO -10')
    expect(
      liveStatus({
        memberId: 'a',
        data: { ...empty, justifications: [{ ministry_member_id: 'a', status: 'approved' }] },
        eventEnded: true,
        toleranceMin: 10,
      }).label,
    ).toBe('JUSTIFICOU')
  })

  it('aguardando, em análise, falta', () => {
    expect(
      liveStatus({ memberId: 'a', data: empty, eventEnded: false, toleranceMin: 10 }).tone,
    ).toBe('waiting')
    expect(
      liveStatus({
        memberId: 'a',
        data: { ...empty, requests: [{ ministry_member_id: 'a', status: 'pending' }] },
        eventEnded: true,
        toleranceMin: 10,
      }).tone,
    ).toBe('pending')
    expect(
      liveStatus({
        memberId: 'a',
        data: { ...empty, ledger: [{ ministry_member_id: 'a', delta: -20, reason: 'absence' }] },
        eventEnded: true,
        toleranceMin: 10,
      }).label,
    ).toBe('FALTA -20')
    expect(
      liveStatus({ memberId: 'a', data: empty, eventEnded: true, toleranceMin: 10 }).label,
    ).toBe('NÃO VEIO')
  })
})
