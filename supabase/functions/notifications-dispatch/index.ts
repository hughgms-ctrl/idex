// Edge Function `notifications-dispatch` (lógica em handler.ts).
// Segredos: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, APP_URL (opcional).
import { createClient } from '@supabase/supabase-js'

import { makeEvolutionSender } from '../_shared/evolution.ts'
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

Deno.serve((req) =>
  handleDispatch(req, {
    serviceKey,
    configured: Boolean(evolution.url && evolution.apiKey && evolution.instance),
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
    now: () => Date.now(),
  }),
)
