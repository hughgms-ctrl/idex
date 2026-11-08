/** Textos do histórico de avisos de falta/atraso (`justification_log`). */

export type JustificationAction =
  | 'created'
  | 'created_by_leader'
  | 'approved'
  | 'rejected'
  | 'reopened'
  | 'cancelled'
  | 'reconfirmed'
  | 'edited'

export type HistoryTone = 'info' | 'ok' | 'bad' | 'neutral'

const KIND: Record<string, string> = { late: 'atraso', absence: 'falta' }

/**
 * Frase de uma linha do histórico. `actor` = quem fez; `member` = de quem é o aviso.
 * Ex.: "Hugo aprovou o aviso de falta de Bruno".
 */
export function historySentence(input: {
  action: string
  kind: string | null
  actor: string | null
  member: string
}): { text: string; tone: HistoryTone } {
  const what = `aviso de ${KIND[input.kind ?? ''] ?? 'falta/atraso'}`
  const actor = input.actor?.trim() || 'Alguém'
  const self = input.actor != null && input.actor === input.member
  const of = self ? '' : ` de ${input.member}`
  switch (input.action as JustificationAction) {
    case 'created':
      return { text: `${actor} enviou ${what}${of}`, tone: 'info' }
    case 'created_by_leader':
      return { text: `${actor} registrou ${what} por ${input.member}`, tone: 'info' }
    case 'approved':
      return { text: `${actor} aprovou o ${what}${of}`, tone: 'ok' }
    case 'rejected':
      return { text: `${actor} recusou o ${what}${of}`, tone: 'bad' }
    case 'reopened':
      return { text: `${actor} reabriu o ${what}${of}`, tone: 'neutral' }
    case 'cancelled':
      return { text: `${actor} cancelou o ${what}${of}`, tone: 'neutral' }
    case 'reconfirmed':
      return { text: `${actor} confirmou que o ${what} ainda vale`, tone: 'neutral' }
    case 'edited':
      return { text: `${actor} mudou o ${what}${of}`, tone: 'neutral' }
    default:
      return { text: `${actor}: ${input.action}`, tone: 'neutral' }
  }
}

/** Tipo do aviso que combina com o desconto do extrato. */
export function kindForLedgerReason(reason: string): 'late' | 'absence' {
  return reason === 'late' ? 'late' : 'absence'
}

/**
 * Descontos (atraso/falta) de um evento que ainda não voltaram por aviso
 * aprovado. Soma os lançamentos do evento: se o total de desconto + ajustes
 * "Aviso aprovado…" for negativo, ainda dá para justificar.
 */
export function openDiscount(
  lines: { delta: number; reason: string; note: string | null }[],
): number {
  let total = 0
  for (const l of lines) {
    if (l.reason === 'late' || l.reason === 'absence') total += l.delta
    else if (l.reason === 'adjustment' && (l.note ?? '').startsWith('Aviso aprovado'))
      total += l.delta
  }
  return total < 0 ? -total : 0
}

// ---------------------------------------------------------------------------
// Histórico agrupado: um cartão por aviso (envio, análise… viram passos) e o
// aviso do culto e do ensaio junto (mesma chegada) num cartão só.
// ---------------------------------------------------------------------------

export type HistoryEvent = {
  id: string
  title: string
  starts_at: string
  arrive_at: string | null
  service_event_id: string | null
}

export type HistoryRow = {
  id: string
  justification_id: string | null
  action: string
  kind: string | null
  reason: string | null
  note: string | null
  at: string
  member_id: string
  member: string
  actor: string | null
  event: HistoryEvent
}

export type HistoryStep = { action: string; actor: string | null; at: string; note: string | null }

export type HistoryCard = {
  key: string
  memberId: string
  member: string
  kind: string | null
  /** motivos (um por aviso; repetidos aparecem uma vez) */
  reasons: string[]
  events: HistoryEvent[]
  /** situação atual: a última decisão (ou cancelado / aguardando) */
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  /** quem registrou: o próprio integrante ou o líder */
  byLeader: boolean
  steps: HistoryStep[]
  lastAt: string
}

const JOINT_MS = 5 * 60_000

/** Mesma regra de `events_joint`: mesmo culto (ou o próprio) e chegada até 5 min de diferença. */
export function historyEventsJoint(a: HistoryEvent, b: HistoryEvent): boolean {
  if (a.id === b.id) return false
  const fa = a.service_event_id ?? a.id
  const fb = b.service_event_id ?? b.id
  if (fa !== fb) return false
  const ta = Date.parse(a.arrive_at ?? a.starts_at)
  const tb = Date.parse(b.arrive_at ?? b.starts_at)
  return Math.abs(ta - tb) <= JOINT_MS
}

const STATUS_OF: Record<string, HistoryCard['status'] | undefined> = {
  created: 'pending',
  created_by_leader: 'pending',
  reopened: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
}

/** Cartões do histórico, do mais recente para o mais antigo. */
export function groupHistory(rows: HistoryRow[]): HistoryCard[] {
  // 1) um grupo por aviso
  const byJust = new Map<string, HistoryRow[]>()
  for (const r of rows) {
    const k = r.justification_id ?? r.id
    const list = byJust.get(k)
    if (list) list.push(r)
    else byJust.set(k, [r])
  }

  const cards: HistoryCard[] = []
  for (const [key, list] of byJust) {
    const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at) || order(a) - order(b))
    let status: HistoryCard['status'] = 'pending'
    for (const r of sorted) status = STATUS_OF[r.action] ?? status
    const latest = sorted[sorted.length - 1]!
    const textRow = [...sorted].reverse().find((r) => r.reason) ?? latest
    cards.push({
      key,
      memberId: latest.member_id,
      member: latest.member,
      kind: textRow.kind,
      reasons: textRow.reason ? [textRow.reason] : [],
      events: [latest.event],
      status,
      byLeader: sorted.some((r) => r.action === 'created_by_leader'),
      steps: sorted.map((r) => ({ action: r.action, actor: r.actor, at: r.at, note: r.note })),
      lastAt: latest.at,
    })
  }

  // 2) junta os avisos da mesma pessoa e do mesmo tipo em culto e ensaio juntos
  const merged: HistoryCard[] = []
  for (const card of cards.sort((a, b) => a.lastAt.localeCompare(b.lastAt))) {
    const twin = merged.find(
      (m) =>
        m.memberId === card.memberId &&
        m.kind === card.kind &&
        m.events.some((e) => card.events.some((c) => historyEventsJoint(e, c))),
    )
    if (!twin) {
      merged.push(card)
      continue
    }
    twin.events.push(...card.events)
    for (const r of card.reasons) {
      if (!twin.reasons.some((x) => norm(x) === norm(r))) twin.reasons.push(r)
    }
    twin.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    twin.steps = dedupeSteps([...twin.steps, ...card.steps])
    twin.byLeader ||= card.byLeader
    if (card.lastAt > twin.lastAt) {
      twin.lastAt = card.lastAt
      twin.status = card.status
    }
  }
  return merged.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

function order(r: HistoryRow): number {
  // no mesmo instante, o envio vem antes da decisão
  return r.action === 'created' || r.action === 'created_by_leader' ? 0 : 1
}

function norm(s: string | null): string {
  return (s ?? '').trim().toLowerCase()
}

/** Mesmo passo (ação + pessoa) até 1 hora depois do anterior igual conta uma vez só. */
function dedupeSteps(steps: HistoryStep[]): HistoryStep[] {
  const kept: HistoryStep[] = []
  for (const s of [...steps].sort((a, b) => a.at.localeCompare(b.at))) {
    const dup = kept.some(
      (k) =>
        k.action === s.action &&
        k.actor === s.actor &&
        Math.abs(Date.parse(s.at) - Date.parse(k.at)) <= 3_600_000,
    )
    if (!dup) kept.push(s)
  }
  return kept
}

/** Frase curta de um passo, sem repetir o nome do integrante. Ex.: "Aprovado por Hugo". */
export function stepLabel(step: HistoryStep, member: string): string {
  const who = step.actor?.trim() || 'alguém'
  switch (step.action as JustificationAction) {
    case 'created':
      return step.actor && step.actor !== member ? `Enviado por ${who}` : 'Enviado'
    case 'created_by_leader':
      return `Registrado por ${who}`
    case 'approved':
      return `Aprovado por ${who}`
    case 'rejected':
      return `Recusado por ${who}`
    case 'reopened':
      return `Reaberto por ${who}`
    case 'cancelled':
      return `Cancelado por ${who}`
    case 'reconfirmed':
      return 'Confirmou que ainda vale'
    case 'edited':
      return `Alterado por ${who}`
    default:
      return step.action
  }
}
