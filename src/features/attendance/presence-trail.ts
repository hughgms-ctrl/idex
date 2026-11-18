/**
 * Registro da presença de um integrante (`member_presence_trail`): tentativas,
 * registros, pedidos "esqueci" e avisos de presença não registrada, em frases
 * curtas para o líder conferir no extrato antes de decidir.
 */
import { DEFAULT_TZ, localParts } from '@domain/time.ts'

export type TrailRow = {
  event_id: string
  root_id: string
  event_title: string
  at: string
  what: string
  detail: string
  distance_m: number | null
  minutes: number | null
  delivered: boolean | null
}

export const ATTEMPT_LABEL: Record<string, string> = {
  ok: 'check-in aceito',
  outside_radius: 'fora do raio',
  invalid_qr: 'QR expirado',
  no_location: 'igreja sem localização',
  not_scheduled: 'não escalado',
  out_of_time: 'fora do horário',
}

const REQUEST_STATUS: Record<string, string> = {
  pending: 'aguardando o líder',
  approved: 'aprovado',
  adjusted: 'aprovado com ajuste',
  rejected: 'recusado',
}

const NOTICE_STAGE: Record<string, string> = {
  during: '"ainda não registrou" (durante)',
  after: '"presença não registrada" (depois)',
  last: '"últimas horas" (antes do prazo)',
}

const pad = (n: number) => String(n).padStart(2, '0')
function stamp(iso: string, tz = DEFAULT_TZ): string {
  const p = localParts(iso, tz)
  return `${pad(p.day)}/${pad(p.month)} ${pad(p.hour)}:${pad(p.minute)}`
}

/** Uma linha do registro, ex.: "15/11 14:57 · Culto · tentou: fora do raio (a 459 m)". */
export function describeTrail(row: TrailRow, eventId: string): string {
  const where = row.event_id === eventId ? '' : ` · no ${row.event_title}`
  const m = row.distance_m != null ? ` (a ${Math.round(row.distance_m)} m)` : ''
  switch (row.what) {
    case 'attempt':
      if (row.detail === 'ok') return `${stamp(row.at)}${where} · tentou: ${ATTEMPT_LABEL.ok}`
      return `${stamp(row.at)}${where} · tentou: ${ATTEMPT_LABEL[row.detail] ?? row.detail}${m}`
    case 'checkin':
      return `${stamp(row.at)}${where} · presença registrada${
        row.minutes ? ` (${row.minutes} min depois da chegada)` : ' no horário'
      }`
    case 'request':
      return `${stamp(row.at)}${where} · pediu registro ("esqueci"): ${
        REQUEST_STATUS[row.detail] ?? row.detail
      }`
    case 'notice':
      return `${stamp(row.at)}${where} · avisado ${NOTICE_STAGE[row.detail] ?? row.detail}${
        row.delivered === false ? ' — não entregue' : ''
      }`
    default:
      return `${stamp(row.at)}${where} · ${row.what}`
  }
}

/** Linhas do evento e dos outros eventos do mesmo culto (culto + ensaios), em ordem. */
export function trailFor(rows: TrailRow[], eventId: string, rootId: string): string[] {
  return rows
    .filter((r) => r.event_id === eventId || r.root_id === rootId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((r) => describeTrail(r, eventId))
}
