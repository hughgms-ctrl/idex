// Edge Function `notifications-dispatch` (lógica em handler.ts).
// Segredos: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, APP_URL (opcional);
// aviso no celular: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from '@supabase/supabase-js'

import { makeEvolutionSender } from '../_shared/evolution.ts'
import { sendWebPush } from '../_shared/webpush.ts'
import { handleDispatch, type QueueItem } from './handler.ts'

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
  auth: { persistSession: false },
})
const evolution = {
  url: Deno.env.get('EVOLUTION_API_URL') ?? '',
  apiKey: Deno.env.get('EVOLUTION_API_KEY') ?? '',
  instance: Deno.env.get('EVOLUTION_INSTANCE') ?? '',
}
const vapid = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
  subject: Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@idex.app',
}

Deno.serve((req) =>
  handleDispatch(req, {
    serviceKey,
    whatsappConfigured: Boolean(evolution.url && evolution.apiKey && evolution.instance),
    pushConfigured: Boolean(vapid.publicKey && vapid.privateKey),
    appUrl: Deno.env.get('APP_URL') ?? null,
    claim: async (limit) => {
      const { data, error } = await db.rpc('claim_notifications', { p_limit: limit })
      if (error) throw new Error(error.message)
      return (data ?? []) as QueueItem[]
    },
    finish: async (id, ok, err, retryAt) => {
      const { error } = await db.rpc('finish_notification', {
        p_id: id,
        p_ok: ok,
        p_error: err,
        p_retry_at: retryAt,
      })
      if (error) throw new Error(error.message)
    },
    send: makeEvolutionSender(evolution),
    pushSubscriptions: async (profileId) => {
      const { data, error } = await db
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('profile_id', profileId)
      if (error) throw new Error(error.message)
      return data ?? []
    },
    sendPush: (sub, message) => sendWebPush(vapid, sub, message),
    removeSubscription: async (endpoint) => {
      await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
    },
    markPushSent: async (id) => {
      await db
        .from('notification_queue')
        .update({ push_sent_at: new Date().toISOString() })
        .eq('id', id)
    },
    now: () => Date.now(),
  }),
)
