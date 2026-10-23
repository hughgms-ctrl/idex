import { createECDH, createPublicKey, randomBytes, verify } from 'node:crypto'
// referência independente (só nos testes): a biblioteca que o web-push usa
import ece from 'http_ece'
import { describe, expect, it } from 'vitest'

import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  generateVapidKeys,
  sendWebPush,
  vapidJwt,
} from './webpush.ts'

function browserSubscription() {
  const ua = createECDH('prime256v1')
  ua.generateKeys()
  const auth = randomBytes(16)
  return {
    ua,
    auth,
    sub: {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      p256dh: b64urlEncode(ua.getPublicKey()),
      auth: b64urlEncode(auth),
    },
  }
}

describe('Web Push', () => {
  it('o navegador consegue abrir a mensagem (RFC 8291, aes128gcm)', async () => {
    const { ua, auth, sub } = browserSubscription()
    const message = JSON.stringify({ title: 'Lembrete', body: 'Culto domingo às 19h' })
    const body = await encryptPayload(sub, new TextEncoder().encode(message))
    const plain = ece.decrypt(Buffer.from(body), {
      version: 'aes128gcm',
      privateKey: ua,
      authSecret: auth,
    })
    expect(plain.toString('utf8')).toBe(message)
  })

  it('assina o VAPID com ES256 para o servidor de push do aparelho', async () => {
    const keys = await generateVapidKeys()
    expect(b64urlDecode(keys.publicKey)).toHaveLength(65)
    const jwt = await vapidJwt(
      { ...keys, subject: 'mailto:teste@idex.app' },
      'https://fcm.googleapis.com/fcm/send/abc',
      1_800_000_000_000,
    )
    const [h, c, s] = jwt.split('.')
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString())
    expect(claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_800_000_000 + 12 * 3600,
      sub: 'mailto:teste@idex.app',
    })
    const pub = b64urlDecode(keys.publicKey)
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: b64urlEncode(pub.slice(1, 33)),
        y: b64urlEncode(pub.slice(33)),
      },
      format: 'jwk',
    })
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${c}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s!, 'base64url'),
    )
    expect(ok).toBe(true)
  })

  it('envia com os cabeçalhos certos e reconhece aparelho que sumiu', async () => {
    const keys = await generateVapidKeys()
    const config = { ...keys, subject: 'mailto:teste@idex.app' }
    const { sub } = browserSubscription()
    let headers: Headers | null = null
    const ok = await sendWebPush(config, sub, { title: 'Oi' }, (async (_url, init) => {
      headers = new Headers(init?.headers)
      return new Response(null, { status: 201 })
    }) as typeof fetch)
    expect(ok).toEqual({ ok: true })
    expect(headers!.get('Content-Encoding')).toBe('aes128gcm')
    expect(headers!.get('Authorization')).toMatch(/^vapid t=.+\..+\..+, k=/)

    const gone = await sendWebPush(
      config,
      sub,
      { title: 'Oi' },
      (async () => new Response('', { status: 410 })) as typeof fetch,
    )
    expect(gone).toMatchObject({ ok: false, gone: true })
  })
})
