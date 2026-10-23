// Lógica da importação de cifra, separada do Deno para poder ser testada.
import { z } from 'zod'

import { corsHeaders, errorJson, json } from '../_shared/http.ts'
import { cifraClubUrl, isCifraClubUrl, parseCifraClubHtml } from '../_shared/import/cifraclub.ts'

const MAX_BYTES = 3_000_000

export const bodySchema = z
  .object({
    ministryId: z.uuid(),
    url: z.string().trim().optional(),
    artist: z.string().trim().max(120).optional(),
    title: z.string().trim().max(160).optional(),
  })
  .refine((b) => b.url || (b.artist && b.title), {
    message: 'Informe o link ou o artista e o nome da música',
  })

export type Deps = {
  /** id do usuário dono do token (null = não logado) */
  getUserId: (authorization: string) => Promise<string | null>
  /** o usuário (pelo token) é líder do ministério? */
  isLeader: (authorization: string, ministryId: string) => Promise<boolean>
  fetch: typeof fetch
}

export async function handleImportCifra(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorJson('Método não permitido', 405)

  const authorization = req.headers.get('Authorization') ?? ''
  if (!(await deps.getUserId(authorization))) {
    return errorJson('Entre na sua conta para importar cifras', 401)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJson(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400)
  const body = parsed.data

  if (!(await deps.isLeader(authorization, body.ministryId))) {
    return errorJson('Só o líder do ministério importa cifras', 403)
  }

  const target = body.url || cifraClubUrl(body.artist ?? '', body.title ?? '')
  if (!isCifraClubUrl(target)) {
    return errorJson('Use um link do Cifra Club (https://www.cifraclub.com.br/...)', 400)
  }

  let response: Response
  try {
    response = await deps.fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (ide.x importador de cifra)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return errorJson(
      'Não foi possível acessar o Cifra Club agora. Tente de novo ou cole a cifra.',
      502,
    )
  }
  const finalUrl = response.url || target
  if (!isCifraClubUrl(finalUrl)) return errorJson('O link levou para fora do Cifra Club', 400)
  if (response.status === 404) {
    return errorJson(
      'Não encontramos essa música no Cifra Club. Confira o nome ou cole o link.',
      404,
    )
  }
  if (!response.ok)
    return errorJson('O Cifra Club não respondeu. Tente de novo ou cole a cifra.', 502)

  const html = (await response.text()).slice(0, MAX_BYTES)
  const result = parseCifraClubHtml(html, finalUrl)
  if (!result) return errorJson('Não achamos a cifra nessa página. Cole a cifra manualmente.', 422)
  return json(result)
}
