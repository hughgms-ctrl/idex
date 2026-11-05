// Menções na conversa (@Nome, @all): contas puras do campo de texto e da bolha.

export type MentionPerson = { id: string; name: string }
export type PickedMention = { id: string; label: string }

/** Tokens que citam todo mundo (grupo/culto). */
export const ALL_TOKENS = ['all', 'todos'] as const

const strip = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Se o cursor está logo depois de "@algo" (começo do texto ou depois de
 * espaço), devolve onde o "@" começa e o que foi digitado depois dele.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const match = /(^|\s)@([\p{L}\p{N}_.-]*)$/u.exec(before)
  if (!match) return null
  const query = match[2] ?? ''
  return { start: caret - query.length - 1, query }
}

/**
 * Pessoas que combinam com o que foi digitado depois do "@": começo de
 * qualquer palavra do nome, sem acento nem caixa. Até `limit`.
 */
export function filterPeople(people: MentionPerson[], query: string, limit = 6): MentionPerson[] {
  const q = strip(query)
  if (!q) return people.slice(0, limit)
  return people
    .filter((p) => {
      const name = strip(p.name)
      return name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))
    })
    .slice(0, limit)
}

/** "@all" aparece na lista enquanto o que foi digitado combina com all/todos. */
export function matchesAll(query: string): boolean {
  const q = strip(query)
  return ALL_TOKENS.some((t) => t.startsWith(q))
}

/** Troca "@Jo" (de `start` até o cursor) por "@João Silva " e devolve o novo cursor. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  label: string,
): { text: string; caret: number } {
  const insert = `@${label} `
  const after = text.slice(caret).replace(/^\s+/, '')
  return { text: text.slice(0, start) + insert + after, caret: start + insert.length }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** O texto ainda tem "@rótulo" (seguido de fim, espaço ou pontuação)? */
function hasLabel(text: string, label: string): boolean {
  return new RegExp(`(^|\\s)@${escapeRe(label)}(?=$|[\\s.,;:!?)])`, 'u').test(text)
}

/** Quem continua citado no texto na hora de enviar (apagou o "@Nome" = não cita). */
export function collectMentions(
  text: string,
  picked: PickedMention[],
): { mentions: string[]; mentionAll: boolean } {
  const mentions = [...new Set(picked.filter((p) => hasLabel(text, p.label)).map((p) => p.id))]
  const mentionAll = ALL_TOKENS.some((t) =>
    new RegExp(`(^|\\s)@${t}(?=$|[\\s.,;:!?)])`, 'iu').test(text),
  )
  return { mentions, mentionAll }
}

export type MentionPart = { text: string; mention?: 'me' | 'other' | 'all' }

/**
 * Separa as menções do texto da mensagem para destacar: `@Nome` de quem foi
 * citado (nomes em `labels`, com o id) e `@all`/`@todos` quando a mensagem
 * citou todos.
 */
export function splitMentions(
  text: string,
  labels: { id: string; label: string }[],
  myId: string,
  mentionAll: boolean,
): MentionPart[] {
  const tokens: { token: string; kind: 'me' | 'other' | 'all' }[] = labels
    .filter((l) => l.label.trim())
    .map((l) => ({ token: l.label, kind: l.id === myId ? 'me' : 'other' }))
  if (mentionAll) for (const t of ALL_TOKENS) tokens.push({ token: t, kind: 'all' })
  if (tokens.length === 0) return [{ text }]
  // nomes mais longos primeiro ("Ana Paula" antes de "Ana")
  tokens.sort((a, b) => b.token.length - a.token.length)
  const re = new RegExp(
    `(^|\\s)@(${tokens.map((t) => escapeRe(t.token)).join('|')})(?=$|[\\s.,;:!?)])`,
    'giu',
  )
  const parts: MentionPart[] = []
  let last = 0
  for (const match of text.matchAll(re)) {
    const lead = match[1] ?? ''
    const start = (match.index ?? 0) + lead.length
    const word = match[2] ?? ''
    const token = tokens.find((t) => t.token.toLowerCase() === word.toLowerCase())
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: `@${word}`, mention: token?.kind ?? 'other' })
    last = start + word.length + 1
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
