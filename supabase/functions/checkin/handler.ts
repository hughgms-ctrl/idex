// Check-in: valida escala, horário e o que o líder exige no ministério
// (`checkin_mode`): só QR, QR + localização ou só localização. QR = token
// HMAC em janela de 30s. Calcula atraso/pontos com as regras puras e grava.
import { z } from 'zod'

import type { Deps } from '../_shared/deps.ts'
import { withinRadius } from '../_shared/domain/geo.ts'
import { callTime } from '../_shared/domain/schedule.ts'
import {
  attendanceOutcome,
  consequenceReason,
  lateConsequence,
  rulesFromSettings,
} from '../_shared/domain/points.ts'
import { parseFixedCode, parseQrPayload, verifyQrToken } from '../_shared/domain/qr.ts'
import { corsHeaders, errorJson, json } from '../_shared/http.ts'

const bodySchema = z.object({
  qr: z.string().min(10).max(400).optional(),
  code: z.string().max(400).optional(),
  eventId: z.uuid().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
})

export type CheckinMode = 'qr' | 'qr_geo' | 'geo'

export function checkinMode(settings: Record<string, unknown>): CheckinMode {
  const mode = settings.checkin_mode
  return mode === 'qr' || mode === 'geo' ? mode : 'qr_geo'
}

const OPEN_BEFORE_MS = 2 * 3_600_000 // check-in abre 2h antes da chegada

export type CheckinDeps = Pick<
  Deps,
  | 'getUserId'
  | 'loadEventContext'
  | 'recordAttendance'
  | 'logAttempt'
  | 'balanceFor'
  | 'applyConsequence'
  | 'resolveCheckinCode'
> & { qrSecret: string; now: () => number }

export async function handleCheckin(req: Request, deps: CheckinDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorJson('Método não permitido', 405)
  if (!deps.qrSecret) return errorJson('Check-in não configurado (QR_SECRET ausente)', 500)

  const userId = await deps.getUserId(req.headers.get('Authorization') ?? '')
  if (!userId) return errorJson('Entre na sua conta para bater o ponto', 401)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJson('Dados do check-in inválidos. Tente de novo.', 400)
  const body = parsed.data
  const lat = body.lat ?? null
  const lng = body.lng ?? null
  const accuracy = body.accuracy ?? null
  const hasLocation = lat !== null && lng !== null

  // QR fixo (impresso) ou QR rotativo (telão)
  const fixedCode = parseFixedCode(body.code ?? body.qr ?? '')
  const payload = !fixedCode && body.qr ? parseQrPayload(body.qr) : null
  if (body.qr && !payload && !fixedCode) return errorJson('Este QR não é de check-in do ide.x', 400)
  let eventId = payload?.eventId ?? body.eventId
  if (fixedCode) {
    const found = await deps.resolveCheckinCode(fixedCode, userId, deps.now())
    if (found.status !== 'ok') {
      if (found.status === 'invalid') {
        return errorJson('Este QR não vale mais. Peça ao líder o QR novo.', 400)
      }
      if (found.status === 'not_member') {
        return errorJson('Você não faz parte deste ministério', 403)
      }
      return errorJson(
        'Nenhum culto ou ensaio seu com ponto aberto agora (abre 2h antes da chegada).',
        409,
      )
    }
    eventId = found.eventId
  }
  if (!eventId) return errorJson('Leia o QR Code do ministério', 400)

  const ctx = await deps.loadEventContext(eventId, userId)
  if (!ctx) return errorJson('Evento não encontrado', 404)
  if (!ctx.member || ctx.member.status !== 'active') {
    return errorJson('Você não faz parte deste ministério', 403)
  }
  const attempt = (outcome: string, distanceM?: number) =>
    deps.logAttempt({
      eventId: ctx.event.id,
      memberId: ctx.member!.id,
      outcome,
      lat,
      lng,
      accuracyM: accuracy,
      distanceM,
    })

  const mode = checkinMode(ctx.settings)
  const needsQr = mode !== 'geo'
  const needsGeo = mode !== 'qr'
  const hasQr = Boolean(payload || fixedCode)
  if (needsQr && !hasQr) {
    return errorJson('Neste ministério o ponto é pelo QR Code. Leia o QR que o líder mostra.', 400)
  }
  if (needsGeo && !hasLocation) {
    return errorJson('Ative a localização do celular para bater o ponto', 400)
  }

  if (ctx.alreadyCheckedIn) return errorJson('Sua presença neste evento já está registrada', 409)
  if (ctx.benched) {
    return errorJson(
      'Você está fora deste evento pela regra de atraso do ministério. Fale com o líder.',
      403,
    )
  }
  if (!ctx.assigned) {
    await attempt('not_scheduled')
    return errorJson('Você não está escalado neste evento', 403)
  }

  const now = deps.now()
  // o ponto abre 2h antes da CHEGADA da equipe (ou do início, sem chegada definida)
  const start = new Date(ctx.event.starts_at).getTime()
  const call = new Date(callTime(ctx.event)).getTime()
  const end = ctx.event.ends_at ? new Date(ctx.event.ends_at).getTime() : start + 2 * 3_600_000
  if (now < call - OPEN_BEFORE_MS || now > end) {
    await attempt('out_of_time')
    return errorJson('O check-in deste evento não está aberto agora', 409)
  }

  // o QR rotativo confere o token; o fixo já foi validado pelo código
  if (
    needsQr &&
    payload &&
    !(await verifyQrToken(deps.qrSecret, ctx.event.id, payload.token, now))
  ) {
    await attempt('invalid_qr')
    return errorJson('QR expirado. Aponte a câmera para o QR de novo.', 400)
  }

  // Distância: obrigatória nos modos com localização; no "só QR" é só registro
  const placeLat = ctx.event.lat ?? ctx.church.lat
  const placeLng = ctx.event.lng ?? ctx.church.lng
  const hasPlace = placeLat !== null && placeLng !== null
  if (needsGeo && !hasPlace) {
    await attempt('no_location')
    return errorJson('O líder ainda não cadastrou a localização da igreja', 409)
  }
  const radiusM = ctx.event.radius_m ?? ctx.settings.checkin_radius_m ?? ctx.church.checkin_radius_m
  const geo =
    hasPlace && hasLocation
      ? withinRadius({
          place: { lat: placeLat!, lng: placeLng! },
          device: { lat: lat!, lng: lng! },
          accuracyM: accuracy,
          radiusM,
        })
      : null
  if (needsGeo && !geo!.ok) {
    await attempt('outside_radius', geo!.distanceM)
    return errorJson(`Você está a ${geo!.distanceM} m da igreja (limite: ${radiusM} m)`, 403)
  }

  const arrivedAt = new Date(now).toISOString()
  const outcome = attendanceOutcome({
    eventStart: callTime(ctx.event),
    arrivedAt,
    justified: ctx.justified,
    rules: rulesFromSettings(
      ctx.settings as Parameters<typeof rulesFromSettings>[0],
      ctx.event.kind,
    ),
  })
  try {
    await deps.recordAttendance({
      eventId: ctx.event.id,
      memberId: ctx.member.id,
      arrivedAt,
      lateMinutes: outcome.lateMinutes,
      delta: outcome.delta,
      source: hasQr && needsQr ? 'qr' : 'geo',
      lat,
      lng,
      accuracyM: accuracy,
      distanceM: geo?.distanceM ?? null,
    })
  } catch (err) {
    if (String(err).includes('duplicate'))
      return errorJson('Sua presença neste evento já está registrada', 409)
    throw err
  }
  await attempt('ok', geo?.distanceM)

  // Passou da tolerância: pode ficar de fora (regra do ministério)
  const scope = lateConsequence({
    kind: ctx.event.kind,
    beyondTolerance: outcome.kind === 'late',
    linkedToService: Boolean(ctx.event.service_event_id),
    rule: ctx.settings,
  })
  const tolerance = rulesFromSettings(
    ctx.settings as Parameters<typeof rulesFromSettings>[0],
    ctx.event.kind,
  ).lateToleranceMin
  const limit = new Date(new Date(callTime(ctx.event)).getTime() + tolerance * 60_000)
  const consequence = scope === 'none' ? null : consequenceReason(scope, hhmm(limit))
  if (scope !== 'none') {
    await deps.applyConsequence({
      eventId: ctx.event.id,
      memberId: ctx.member.id,
      scope,
      reason: consequence,
    })
  }

  return json({
    arrivedAt,
    kind: outcome.kind,
    lateMinutes: outcome.lateMinutes,
    delta: outcome.delta,
    balance: await deps.balanceFor(ctx.member.id, ctx.event.id),
    distanceM: geo?.distanceM ?? null,
    consequence: scope === 'none' ? null : { scope, message: consequence },
  })
}

function hhmm(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
