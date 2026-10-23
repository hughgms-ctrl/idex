// Edge Function `qr-token` (lógica em handler.ts). Segredos: QR_SECRET.
import { createClient } from '@supabase/supabase-js'

import { makeDeps } from '../_shared/deps.ts'
import { handleQrToken } from './handler.ts'

const deps = makeDeps(createClient, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
})

Deno.serve((req) =>
  handleQrToken(req, { ...deps, qrSecret: Deno.env.get('QR_SECRET') ?? '', now: () => Date.now() }),
)
