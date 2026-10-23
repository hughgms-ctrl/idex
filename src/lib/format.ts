// Datas guardadas em UTC; exibidas sempre no fuso de São Paulo.
export const APP_TIMEZONE = 'America/Sao_Paulo'

const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIMEZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export function formatDateTime(value: string | Date): string {
  return dateTimeFmt.format(new Date(value)).replace(/\.,?/g, '').replace(/\s+/g, ' ')
}

// "Sáb, 24 out · 19:30" (formato dos protótipos)
export function formatEventDate(value: string | Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: APP_TIMEZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value.replace('.', '')]),
  )
  const weekday = String(parts.weekday ?? '')
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${parts.day} ${parts.month} · ${parts.hour}:${parts.minute}`
}

export function formatDate(value: string | Date): string {
  // Datas puras ("2026-10-23") são dias de calendário, não instantes.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  return dateFmt.format(new Date(value))
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function relativeDays(value: string | Date, now = new Date()): string {
  const toDay = (d: Date) =>
    new Date(d.toLocaleString('en-US', { timeZone: APP_TIMEZONE })).setHours(0, 0, 0, 0)
  const diff = Math.round((toDay(new Date(value)) - toDay(now)) / 86_400_000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`
}

/** "25/10" no fuso de São Paulo */
export function formatDayMonth(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}
