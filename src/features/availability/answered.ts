/**
 * A resposta (ou observação) foi escrita antes da última remarcação?
 * Ex.: "não posso por causa do trabalho" escrito antes de o ensaio mudar de
 * dia pode não valer mais — o app avisa para conferir.
 */
export function writtenBeforeChange(
  answeredAt: string | null | undefined,
  changes: (string | null | undefined)[],
): boolean {
  if (!answeredAt) return false
  const at = new Date(answeredAt).getTime()
  return changes.some((c) => Boolean(c) && new Date(c as string).getTime() > at)
}

/** Remarcação mais recente entre os eventos (culto e ensaios). */
export function latestChange(changes: (string | null | undefined)[]): string | null {
  let best: string | null = null
  for (const c of changes) {
    if (c && (!best || new Date(c).getTime() > new Date(best).getTime())) best = c
  }
  return best
}

/**
 * Aviso de falta/atraso pendente que foi enviado (ou confirmado pela última
 * vez) antes de o evento mudar de dia/horário: pode não valer mais.
 */
export function noticeOutdated(
  notice: { created_at: string; reconfirmed_at?: string | null; status?: string },
  event: { rescheduled_at?: string | null },
): boolean {
  if (notice.status && notice.status !== 'pending') return false
  const last = latestChange([notice.created_at, notice.reconfirmed_at])
  return writtenBeforeChange(last, [event.rescheduled_at])
}
