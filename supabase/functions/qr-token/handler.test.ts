import { describe, expect, it } from 'vitest'

import { parseQrPayload, verifyQrToken } from '../_shared/domain/qr.ts'
import { handleQrToken, type QrTokenDeps } from './handler.ts'

const EVENT = '0b6f6f8e-3c1a-4d2a-9f4b-1a2b3c4d5e6f'
const NOW = 1_792_800_010_000

const deps = (over: Partial<QrTokenDeps> = {}): QrTokenDeps => ({
  getUserId: async (a) => (a ? 'lider' : null),
  isEventLeader: async () => true,
  qrSecret: 's',
  now: () => NOW,
  ...over,
})
const post = (d: QrTokenDeps, body: unknown) =>
  handleQrToken(
    new Request('http://x', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
      body: JSON.stringify(body),
    }),
    d,
  )

describe('qr-token', () => {
  it('líder recebe QR válido e quando renovar', async () => {
    const res = await post(deps(), { eventId: EVENT })
    const body = (await res.json()) as { payload: string; refreshInMs: number }
    const parsed = parseQrPayload(body.payload)!
    expect(await verifyQrToken('s', EVENT, parsed.token, NOW)).toBe(true)
    expect(body.refreshInMs).toBe(20_000)
  })

  it('membro comum não gera QR', async () => {
    expect(
      (await post(deps({ isEventLeader: async () => false }), { eventId: EVENT })).status,
    ).toBe(403)
  })
})
