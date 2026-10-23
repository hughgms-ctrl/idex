// Edge Function `review-checkin-request` (lógica em handler.ts).
import { createClient } from '@supabase/supabase-js'

import { makeDeps } from '../_shared/deps.ts'
import { handleReviewCheckinRequest } from './handler.ts'

const deps = makeDeps(createClient, {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
})

Deno.serve((req) => handleReviewCheckinRequest(req, deps))
