// QR rotativo para o líder projetar: devolve o conteúdo atual do QR.
import { z } from 'zod'

import type { Deps } from '../_shared/deps.ts'
import { QR_WINDOW_SECONDS, qrPayload, qrWindow } from '../_shared/domain/qr.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'

const bodySchema = z.object({ eventId: z.uuid() })

export type QrTokenDeps = Pick<Deps, 'getUserId' | 'isEventLeader'> & {
  qrSecret: string
  now: () => number
}

export async function handleQrToken(req: Request, deps: QrTokenDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorJson('Método não permitido', 405)
  if (!deps.qrSecret) return errorJson('Check-in não configurado (QR_SECRET ausente)', 500)

  const authorization = req.headers.get('Authorization') ?? ''
  if (!(await deps.getUserId(authorization))) return errorJson('Entre na sua conta', 401)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJson('Evento inválido', 400)
  if (!(await deps.isEventLeader(authorization, parsed.data.eventId))) {
    return errorJson('Só o líder exibe o QR do evento', 403)
  }

  const now = deps.now()
  const windowEndsAt = (qrWindow(now) + 1) * QR_WINDOW_SECONDS * 1000
  return json({
    payload: await qrPayload(deps.qrSecret, parsed.data.eventId, now),
    refreshInMs: Math.max(1_000, windowEndsAt - now),
  })
}
