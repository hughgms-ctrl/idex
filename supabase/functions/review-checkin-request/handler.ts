// Líder analisa um "esqueci de registrar": aprova (horário declarado),
// ajusta o horário ou recusa (vira falta). Pontos pelas regras puras.
import { z } from 'zod'

import type { Deps } from '../_shared/deps.ts'
import {
  consequenceReason,
  lateConsequence,
  reviewOutcome,
  rulesFromSettings,
  type ReviewDecision,
} from '../_shared/domain/points.ts'
import { callTime } from '../_shared/domain/schedule.ts'
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
  'getUserId' | 'isLeaderOfMember' | 'loadRequest' | 'applyReview' | 'applyConsequence'
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
    eventStart: callTime(loaded.event),
    declaredArrivedAt: loaded.request.declared_arrived_at,
    review,
    justified: loaded.justified,
    rules: rulesFromSettings(
      loaded.settings as Parameters<typeof rulesFromSettings>[0],
      loaded.event.kind,
    ),
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
  // Regra de atraso: recusado conta como falta; aprovado no horário devolve
  // a pessoa à escala se ela tinha ficado de fora por "faltou ao ensaio".
  const scope = lateConsequence({
    kind: loaded.event.kind,
    beyondTolerance: outcome.kind === 'late' || outcome.kind === 'absent',
    linkedToService: Boolean(loaded.event.service_event_id),
    rule: loaded.settings,
  })
  await deps.applyConsequence({
    eventId: loaded.event.id,
    memberId: loaded.request.ministry_member_id,
    scope,
    reason:
      scope === 'none'
        ? null
        : outcome.kind === 'absent'
          ? 'Pedido recusado: fora do ensaio e do culto'
          : consequenceReason(scope, 'a tolerância'),
  })
  return json({ status: STATUS[body.decision], ...outcome, consequence: scope })
}
