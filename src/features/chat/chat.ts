// Conversas: contas puras da tela (horários, agrupar mensagens, "digitando…").
import { APP_TIMEZONE } from '@/lib/format'

export type ChatMessage = {
  id: string
  conversation_id: string
  church_id: string
  sender_id: string | null
  body: string
  created_at: string
  deleted_at: string | null
  pending?: boolean // enviada pelo aparelho, esperando o servidor
}

export type ConversationKind = 'ministry' | 'event' | 'direct'

export type ConversationRow = {
  id: string
  kind: string
  title: string
  archived: boolean
  muted: boolean
  unread: number
  last_message_at: string | null
  event_starts_at: string | null
  last_body: string | null
  last_sender_id: string | null
  last_sender_name: string
  last_deleted: boolean
}

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(d) // 2026-10-25

function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.parse(dayKey(a)) - Date.parse(dayKey(b))) / 86_400_000)
}

const hourFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/** Hora da mensagem: "19:24" */
export function messageTime(iso: string): string {
  return hourFmt.format(new Date(iso))
}

/** Na lista de conversas: "19:24" (hoje), "ontem", "seg" (na semana) ou "12/10". */
export function conversationTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const diff = daysBetween(now, date)
  if (diff <= 0) return messageTime(iso)
  if (diff === 1) return 'ontem'
  if (diff < 7) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIMEZONE, weekday: 'short' })
      .format(date)
      .replace('.', '')
  }
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(date)
}

/** Separador de dia na conversa: "Hoje", "Ontem", "Segunda, 20 out" (ano só se for outro). */
export function dayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const diff = daysBetween(now, date)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  const sameYear = dayKey(date).slice(0, 4) === dayKey(now).slice(0, 4)
  const text = new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
    .format(date)
    .replace('.', '')
    .replace(/ de /g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export type ThreadItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'message'; key: string; message: ChatMessage; mine: boolean; first: boolean }

/**
 * Mensagens em ordem, com separador de dia; `first` marca a primeira de uma
 * sequência da mesma pessoa (mostra o nome) — até 5 min entre uma e outra.
 */
export function threadItems(messages: ChatMessage[], myId: string, now = new Date()): ThreadItem[] {
  const items: ThreadItem[] = []
  let lastDay = ''
  let prev: ChatMessage | null = null
  for (const message of messages) {
    const day = dayKey(new Date(message.created_at))
    if (day !== lastDay) {
      items.push({ type: 'day', key: `day-${day}`, label: dayLabel(message.created_at, now) })
      lastDay = day
      prev = null
    }
    const first =
      !prev ||
      prev.sender_id !== message.sender_id ||
      Date.parse(message.created_at) - Date.parse(prev.created_at) > 5 * 60_000
    items.push({
      type: 'message',
      key: message.id,
      message,
      mine: message.sender_id === myId,
      first,
    })
    prev = message
  }
  return items
}

/** Junta mensagens (sem repetir; a versão nova vale, ex.: apagada) em ordem de envio. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m })
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  )
}

/** "Ana está digitando…", "Ana e Beto estão digitando…", "3 pessoas estão digitando…" */
export function typingText(names: string[]): string | null {
  const first = names.map((n) => n.trim().split(/\s+/)[0] || 'Alguém')
  if (first.length === 0) return null
  if (first.length === 1) return `${first[0]} está digitando…`
  if (first.length === 2) return `${first[0]} e ${first[1]} estão digitando…`
  return `${first.length} pessoas estão digitando…`
}

export function unreadLabel(n: number): string {
  return n >= 99 ? '99+' : String(n)
}

/** Linha de baixo da conversa na lista. */
export function previewText(row: ConversationRow, myId: string): string {
  if (!row.last_message_at) {
    return row.kind === 'event' ? 'Conversa da equipe escalada' : 'Nenhuma mensagem ainda'
  }
  if (row.last_deleted) return 'Mensagem apagada'
  const who =
    row.last_sender_id === myId
      ? 'Você: '
      : row.kind === 'direct'
        ? ''
        : `${row.last_sender_name.split(' ')[0]}: `
  return `${who}${row.last_body ?? ''}`
}

/** Grupo do ministério primeiro; depois a conversa mais recente (culto sem mensagem: o mais próximo). */
export function sortConversations<T extends ConversationRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if ((a.kind === 'ministry') !== (b.kind === 'ministry')) return a.kind === 'ministry' ? -1 : 1
    const la = a.last_message_at ? Date.parse(a.last_message_at) : 0
    const lb = b.last_message_at ? Date.parse(b.last_message_at) : 0
    if (la !== lb) return lb - la
    const ea = a.event_starts_at ? Date.parse(a.event_starts_at) : Infinity
    const eb = b.event_starts_at ? Date.parse(b.event_starts_at) : Infinity
    return ea - eb || a.title.localeCompare(b.title, 'pt-BR')
  })
}

/** Total de não lidas para o selo do menu (não conta silenciadas nem arquivadas). */
export function totalUnread(rows: ConversationRow[]): number {
  return rows.reduce((n, r) => (r.muted || r.archived ? n : n + r.unread), 0)
}

export type TextPart = { text: string; href?: string }

/** Separa links (http/https e www.) do texto para virarem clicáveis. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  const re = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi
  let last = 0
  for (const match of text.matchAll(re)) {
    // pontuação no fim não faz parte do link ("veja www.x.com.")
    const url = match[0].replace(/[.,;:!?)\]]+$/, '')
    const start = match.index ?? 0
    if (start > last) parts.push({ text: text.slice(last, start) })
    parts.push({ text: url, href: url.startsWith('www.') ? `https://${url}` : url })
    last = start + url.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
