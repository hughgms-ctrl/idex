// Envia os avisos pendentes da fila: no celular (Web Push) e no WhatsApp
// (Evolution API). Chamada pelo pg_cron (a cada minuto) com a chave service_role.
import {
  normalizePhone,
  renderMessage,
  renderPush,
  retryDelayMs,
  type NotificationKind,
  type NotificationPayload,
  type PushMessage,
} from '../_shared/domain/notifications.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'
import type { PushResult, PushSubscriptionKeys } from '../_shared/webpush.ts'

export type QueueItem = {
  id: string
  kind: NotificationKind
  payload: NotificationPayload
  attempts: number
  profile_id: string
  phone: string | null // null se a pessoa não quer WhatsApp
  push_sent: boolean // já foi entregue no celular (numa tentativa anterior)
}

export type DispatchDeps = {
  serviceKey: string
  whatsappConfigured: boolean // Evolution configurada?
  pushConfigured: boolean // chaves VAPID configuradas?
  appUrl: string | null
  claim: (limit: number) => Promise<QueueItem[]>
  finish: (id: string, ok: boolean, error: string | null, retryAt: string | null) => Promise<void>
  send: (phone: string, text: string) => Promise<{ ok: true } | { ok: false; error: string }>
  pushSubscriptions: (profileId: string) => Promise<PushSubscriptionKeys[]>
  sendPush: (sub: PushSubscriptionKeys, message: PushMessage) => Promise<PushResult>
  removeSubscription: (endpoint: string) => Promise<void>
  markPushSent: (id: string) => Promise<void>
  now: () => number
}

export async function handleDispatch(req: Request, deps: DispatchDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!deps.serviceKey || token !== deps.serviceKey) return errorJson('Não autorizado', 401)
  if (!deps.whatsappConfigured && !deps.pushConfigured) {
    return errorJson(
      'Nenhum canal configurado (Evolution API ou chaves VAPID do aviso no celular)',
      503,
    )
  }

  const items = await deps.claim(50)
  let sent = 0
  let retried = 0
  let failed = 0
  const retryOrFail = async (item: QueueItem, error: string) => {
    const delay = retryDelayMs(item.attempts)
    await deps.finish(
      item.id,
      false,
      error,
      delay === null ? null : new Date(deps.now() + delay).toISOString(),
    )
    if (delay === null) failed++
    else retried++
  }

  for (const item of items) {
    // 1) celular
    let pushDelivered = item.push_sent
    let pushError: string | null = null
    if (!item.push_sent && deps.pushConfigured) {
      const message = renderPush(item.kind, item.payload, item.id)
      for (const sub of await deps.pushSubscriptions(item.profile_id)) {
        const result = await deps.sendPush(sub, message)
        if (result.ok) pushDelivered = true
        else if (result.gone) await deps.removeSubscription(sub.endpoint)
        else pushError = result.error
      }
      if (pushDelivered) await deps.markPushSent(item.id)
    }

    // 2) WhatsApp
    const phone =
      deps.whatsappConfigured && !item.payload.pushOnly ? normalizePhone(item.phone) : null
    if (phone) {
      const text = renderMessage(item.kind, { ...item.payload, appUrl: deps.appUrl })
      const result = await deps.send(phone, text)
      if (result.ok) {
        await deps.finish(item.id, true, null, null)
        sent++
      } else {
        await retryOrFail(item, result.error)
      }
      continue
    }

    if (pushDelivered) {
      await deps.finish(item.id, true, null, null)
      sent++
    } else if (pushError) {
      await retryOrFail(item, `Aviso no celular: ${pushError}`)
    } else {
      const reason =
        item.phone && deps.whatsappConfigured
          ? 'Telefone inválido'
          : item.phone
            ? 'WhatsApp não configurado e sem aviso no celular ativo'
            : 'Sem aviso no celular ativo e sem WhatsApp'
      await deps.finish(item.id, false, reason, null)
      failed++
    }
  }
  return json({ processed: items.length, sent, retried, failed })
}
