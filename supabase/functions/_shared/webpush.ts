// Web Push sem dependências (só WebCrypto, roda no Deno e no Node):
// assinatura VAPID (RFC 8292, ES256) e criptografia aes128gcm (RFC 8291).

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string }
export type VapidConfig = {
  /** chave pública P-256 sem compressão (65 bytes), base64url */
  publicKey: string
  /** chave privada P-256 (32 bytes, o "d"), base64url */
  privateKey: string
  /** contato do responsável, ex.: mailto:contato@igreja.com */
  subject: string
}
export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string } // gone = aparelho não existe mais

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const buf = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes)

// ---------------------------------------------------------------------------
// VAPID
// ---------------------------------------------------------------------------

async function vapidSigningKey(config: VapidConfig): Promise<CryptoKey> {
  const pub = b64urlDecode(config.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida')
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      d: config.privateKey,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

/** JWT ES256 para o cabeçalho Authorization (vale 12h). */
export async function vapidJwt(
  config: VapidConfig,
  endpoint: string,
  nowMs = Date.now(),
): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(nowMs / 1000) + 12 * 3600,
        sub: config.subject,
      }),
    ),
  )
  const unsigned = `${header}.${claims}`
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await vapidSigningKey(config),
      enc.encode(unsigned),
    ),
  )
  return `${unsigned}.${b64urlEncode(signature)}`
}

/** Par de chaves VAPID novo (para configurar o projeto). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  return { publicKey: b64urlEncode(raw), privateKey: jwk.d ?? '' }
}

// ---------------------------------------------------------------------------
// Criptografia do conteúdo (aes128gcm, um único registro)
// ---------------------------------------------------------------------------

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  // para testes: sal e chave do servidor fixos
  fixed?: { salt: Uint8Array; serverKeys: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  if (uaPublic.length !== 65) throw new Error('Chave p256dh inválida')
  const serverKeys =
    fixed?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey))
  const uaKey = await crypto.subtle.importKey(
    'raw',
    buf(uaPublic),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverKeys.privateKey, 256),
  )
  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  )
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const aesKey = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt'])
  // 0x02 = delimitador do último (e único) registro
  const padded = concat(plaintext, new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aesKey, padded),
  )
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export async function sendWebPush(
  config: VapidConfig,
  sub: PushSubscriptionKeys,
  message: unknown,
  fetchImpl: typeof fetch = fetch,
  ttlSeconds = 24 * 3600,
): Promise<PushResult> {
  try {
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)))
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${await vapidJwt(config, sub.endpoint)}, k=${config.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        // alta: entrega na hora mesmo com o celular em economia de bateria
        Urgency: 'high',
      },
      body: buf(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { ok: true }
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      gone: res.status === 404 || res.status === 410,
      error: `HTTP ${res.status} ${text.slice(0, 200)}`,
    }
  } catch (err) {
    return { ok: false, gone: false, error: err instanceof Error ? err.message : String(err) }
  }
}
