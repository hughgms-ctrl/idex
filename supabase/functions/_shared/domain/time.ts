// Funções puras de data/fuso. Datas são instantes UTC; regras de calendário
// (dia da semana, mês, "hoje") sempre no fuso da igreja.

export const DEFAULT_TZ = 'America/Sao_Paulo'

export type LocalParts = {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: number // 0 = domingo
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    formatters.set(tz, f)
  }
  return f
}

export function localParts(date: Date | string | number, tz = DEFAULT_TZ): LocalParts {
  const parts: Record<string, string> = {}
  for (const p of formatter(tz).formatToParts(new Date(date))) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? 'Sun'),
  }
}

/** Diferença (em minutos) entre o horário local e o UTC naquele instante. */
export function tzOffsetMinutes(date: Date | number, tz = DEFAULT_TZ): number {
  const d = new Date(date)
  const p = localParts(d, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, d.getUTCSeconds())
  return Math.round((asUtc - d.getTime()) / 60_000)
}

/** Horário "de parede" no fuso → instante UTC. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  tz = DEFAULT_TZ,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let result = guess - tzOffsetMinutes(guess, tz) * 60_000
  // segunda passada para acertar transições de horário de verão
  result = guess - tzOffsetMinutes(result, tz) * 60_000
  return new Date(result)
}

/** "2026-10-23" no fuso */
export function localDateKey(date: Date | string | number, tz = DEFAULT_TZ): string {
  const p = localParts(date, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 }
}

/** Soma dias a uma data de calendário (sem fuso). */
export function addDaysToKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return d.toISOString().slice(0, 10)
}

/** Início (inclusive) e fim (exclusivo) de um mês no fuso. */
export function monthRange(
  year: number,
  month: number,
  tz = DEFAULT_TZ,
): { start: Date; end: Date } {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  return {
    start: zonedToUtc(year, month, 1, 0, 0, tz),
    end: zonedToUtc(next.y, next.m, 1, 0, 0, tz),
  }
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function minutesBetween(from: Date | string, to: Date | string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 60_000)
}
