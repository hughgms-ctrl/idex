// QR rotativo: token = HMAC-SHA256(segredo, eventId + janela de 30s).
// Aceita a janela atual e a anterior. Usa Web Crypto (Deno e Node 20+).

export const QR_WINDOW_SECONDS = 30
const PREFIX = 'idex1'

export function qrWindow(nowMs: number, windowSeconds = QR_WINDOW_SECONDS): number {
  return Math.floor(nowMs / (windowSeconds * 1000))
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
  let bin = ''
  for (const byte of sig) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 22)
}

export async function qrToken(secret: string, eventId: string, window: number): Promise<string> {
  return hmac(secret, `${eventId}:${window}`)
}

/** Conteúdo do QR exibido pelo líder. */
export async function qrPayload(secret: string, eventId: string, nowMs: number): Promise<string> {
  return `${PREFIX}.${eventId}.${await qrToken(secret, eventId, qrWindow(nowMs))}`
}

/**
 * Endereço do QR: abre o app direto no check-in quando lido pela câmera do
 * celular (fora do app). Ex.: https://app/ponto?q=idex1.<evento>.<token>
 */
export function qrCheckinUrl(appOrigin: string, payload: string): string {
  return `${appOrigin.replace(/\/+$/, '')}/ponto?q=${encodeURIComponent(payload)}`
}

/** Aceita o conteúdo puro (idex1.…) ou o endereço com ?q=. */
export function parseQrPayload(raw: string): { eventId: string; token: string } | null {
  let payload = raw.trim()
  if (/^https?:\/\//i.test(payload)) {
    try {
      payload = new URL(payload).searchParams.get('q') ?? ''
    } catch {
      return null
    }
  }
  const m = payload.trim().match(/^idex1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{10,64})$/i)
  return m?.[1] && m[2] ? { eventId: m[1].toLowerCase(), token: m[2] } : null
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Válido na janela atual ou na anterior. */
export async function verifyQrToken(
  secret: string,
  eventId: string,
  token: string,
  nowMs: number,
): Promise<boolean> {
  const current = qrWindow(nowMs)
  for (const w of [current, current - 1]) {
    if (safeEqual(await qrToken(secret, eventId, w), token)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// QR fixo do ministério (impresso na parede): leva ao ponto do evento do
// integrante que estiver com o ponto aberto. A segurança vem da localização.
// ---------------------------------------------------------------------------

const FIXED_CODE = /^[0-9a-f]{24}$/

export function fixedQrUrl(appOrigin: string, code: string): string {
  return `${appOrigin.replace(/\/+$/, '')}/ponto?c=${code}`
}

/** Código do QR fixo, do conteúdo puro ou do endereço com ?c=. */
export function parseFixedCode(raw: string): string | null {
  let code = raw.trim()
  if (/^https?:\/\//i.test(code)) {
    try {
      code = new URL(code).searchParams.get('c') ?? ''
    } catch {
      return null
    }
  }
  code = code.toLowerCase()
  return FIXED_CODE.test(code) ? code : null
}
