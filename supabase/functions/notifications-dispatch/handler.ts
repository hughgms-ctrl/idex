// Envia os avisos pendentes da fila pelo WhatsApp (Evolution API).
// Chamada pelo pg_cron (a cada minuto) com a chave service_role.
import {
  normalizePhone,
  renderMessage,
  retryDelayMs,
  type NotificationKind,
  type NotificationPayload,
} from '../_shared/domain/notifications.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'

export type QueueItem = {
  id: string
  kind: NotificationKind
  payload: NotificationPayload
  attempts: number
  phone: string | null
}

export type DispatchDeps = {
  serviceKey: string
  configured: boolean // Evolution configurada?
  appUrl: string | null
  claim: (limit: number) => Promise<QueueItem[]>
  finish: (id: string, ok: boolean, error: string | null, retryAt: string | null) => Promise<void>
  send: (phone: string, text: string) => Promise<{ ok: true } | { ok: false; error: string }>
  now: () => number
}

export async function handleDispatch(req: Request, deps: DispatchDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!deps.serviceKey || token !== deps.serviceKey) return errorJson('Não autorizado', 401)
  if (!deps.configured)
    return errorJson('Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE)', 503)

  const items = await deps.claim(50)
  let sent = 0
  let retried = 0
  let failed = 0
  for (const item of items) {
    const phone = normalizePhone(item.phone)
    if (!phone) {
      await deps.finish(item.id, false, 'Telefone inválido', null)
      failed++
      continue
    }
    const text = renderMessage(item.kind, { ...item.payload, appUrl: deps.appUrl })
    const result = await deps.send(phone, text)
    if (result.ok) {
      await deps.finish(item.id, true, null, null)
      sent++
      continue
    }
    const delay = retryDelayMs(item.attempts)
    await deps.finish(
      item.id,
      false,
      result.error,
      delay === null ? null : new Date(deps.now() + delay).toISOString(),
    )
    if (delay === null) failed++
    else retried++
  }
  return json({ processed: items.length, sent, retried, failed })
}
