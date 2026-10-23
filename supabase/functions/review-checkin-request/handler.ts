// Líder analisa um "esqueci de registrar": aprova (horário declarado),
// ajusta o horário ou recusa (vira falta). Pontos pelas regras puras.
import { z } from 'zod'

import type { Deps } from '../_shared/deps.ts'
import { reviewOutcome, rulesFromSettings, type ReviewDecision } from '../_shared/domain/points.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'

const bodySchema = z.discriminatedUnion('decision', [
  z.object({
    requestId: z.uuid(),
    decision: z.literal('approve'),
    note: z.string().max(300).optional(),
  }),
  z.object({
    requestId: z.uuid(),
    decision: z.literal('adjust'),
    arrivedAt: z.iso.datetime({ offset: true }),
    note: z.string().max(300).optional(),
  }),
  z.object({
    requestId: z.uuid(),
    decision: z.literal('reject'),
    note: z.string().max(300).optional(),
  }),
])

const STATUS = { approve: 'approved', adjust: 'adjusted', reject: 'rejected' } as const

export type ReviewDeps = Pick<
  Deps,
  'getUserId' | 'isLeaderOfMember' | 'loadRequest' | 'applyReview'
>

export async function handleReviewCheckinRequest(
  req: Request,
  deps: ReviewDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorJson('Método não permitido', 405)

  const authorization = req.headers.get('Authorization') ?? ''
  const reviewerId = await deps.getUserId(authorization)
  if (!reviewerId) return errorJson('Entre na sua conta', 401)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJson('Decisão inválida', 400)
  const body = parsed.data

  const loaded = await deps.loadRequest(body.requestId)
  if (!loaded) return errorJson('Pedido não encontrado', 404)
  if (!(await deps.isLeaderOfMember(authorization, loaded.request.ministry_member_id))) {
    return errorJson('Só o líder do ministério analisa pedidos', 403)
  }
  if (loaded.request.status !== 'pending') return errorJson('Este pedido já foi analisado', 409)

  const review: ReviewDecision =
    body.decision === 'adjust'
      ? { decision: 'adjust', arrivedAt: body.arrivedAt }
      : { decision: body.decision }
  const outcome = reviewOutcome({
    eventStart: loaded.event.starts_at,
    declaredArrivedAt: loaded.request.declared_arrived_at,
    review,
    justified: loaded.justified,
    rules: rulesFromSettings(loaded.settings as Parameters<typeof rulesFromSettings>[0]),
  })
  await deps.applyReview({
    requestId: body.requestId,
    status: STATUS[body.decision],
    arrivedAt: outcome.arrivedAt,
    lateMinutes: outcome.lateMinutes,
    delta: outcome.delta,
    reviewerId,
    note: body.note ?? null,
  })
  return json({ status: STATUS[body.decision], ...outcome })
}
