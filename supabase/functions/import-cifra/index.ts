// Edge Function: traz a cifra de uma música do Cifra Club para o editor.
// Só o líder do ministério usa; aceita somente links https do Cifra Club.
// Nada é salvo aqui: o texto volta para o app, onde o líder revisa e edita.
import { createClient } from '@supabase/supabase-js'

import { handleImportCifra } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function clientFor(authorization: string) {
  return createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
}

Deno.serve((req) =>
  handleImportCifra(req, {
    getUserId: async (authorization) => {
      const { data } = await clientFor(authorization).auth.getUser()
      return data.user?.id ?? null
    },
    isLeader: async (authorization, ministryId) => {
      const { data } = await clientFor(authorization).rpc('is_ministry_leader', {
        p_ministry_id: ministryId,
      })
      return data === true
    },
    fetch,
  }),
)
