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
