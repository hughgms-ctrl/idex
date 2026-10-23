import { describe, expect, it } from 'vitest'

import { parseQrPayload, qrCheckinUrl, qrPayload, qrWindow, verifyQrToken } from './qr.ts'

const SECRET = 'segredo-de-teste'
const EVENT = '0b6f6f8e-3c1a-4d2a-9f4b-1a2b3c4d5e6f'
const T0 = 1_792_800_000_000 // múltiplo de 30s

describe('QR rotativo', () => {
  it('gera e lê o conteúdo do QR', async () => {
    const payload = await qrPayload(SECRET, EVENT, T0)
    const parsed = parseQrPayload(payload)
    expect(parsed?.eventId).toBe(EVENT)
    expect(parseQrPayload('qualquer coisa')).toBeNull()
  })

  it('o QR é um endereço do app que a câmera do celular abre', async () => {
    const payload = await qrPayload(SECRET, EVENT, T0)
    const url = qrCheckinUrl('https://idex.app/', payload)
    expect(url).toMatch(/^https:\/\/idex\.app\/ponto\?q=idex1\./)
    expect(parseQrPayload(url)).toEqual(parseQrPayload(payload))
    expect(parseQrPayload('https://outro.site/?x=1')).toBeNull()
  })

  it('aceita a janela atual e a anterior, recusa as mais velhas', async () => {
    const { token } = parseQrPayload(await qrPayload(SECRET, EVENT, T0))!
    expect(await verifyQrToken(SECRET, EVENT, token, T0 + 5_000)).toBe(true)
    expect(await verifyQrToken(SECRET, EVENT, token, T0 + 35_000)).toBe(true)
    expect(await verifyQrToken(SECRET, EVENT, token, T0 + 65_000)).toBe(false)
  })

  it('não serve para outro evento nem com outro segredo', async () => {
    const { token } = parseQrPayload(await qrPayload(SECRET, EVENT, T0))!
    expect(await verifyQrToken(SECRET, '11111111-1111-4111-8111-111111111111', token, T0)).toBe(
      false,
    )
    expect(await verifyQrToken('outro', EVENT, token, T0)).toBe(false)
  })

  it('janela de 30 segundos', () => {
    expect(qrWindow(T0 + 29_999) - qrWindow(T0)).toBe(0)
    expect(qrWindow(T0 + 30_000) - qrWindow(T0)).toBe(1)
  })
})
