import { DEFAULT_TZ, localParts, parseDateKey, zonedToUtc } from '@domain/time.ts'

const pad = (n: number) => String(n).padStart(2, '0')

/** Valores para <input type="date"> e <input type="time"> no fuso da igreja. */
export function toLocalInputs(iso: string, tz = DEFAULT_TZ): { date: string; time: string } {
  const p = localParts(iso, tz)
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  }
}

export function fromLocalInputs(date: string, time: string, tz = DEFAULT_TZ): Date {
  const { year, month, day } = parseDateKey(date)
  const [hh, mm] = time.split(':').map(Number)
  return zonedToUtc(year, month, day, hh ?? 0, mm ?? 0, tz)
}

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export const EVENT_KIND_LABEL: Record<string, string> = {
  service: 'Culto',
  rehearsal: 'Ensaio',
  other: 'Outro',
}

/** "16:40" no fuso da igreja */
export function hhmm(iso: string, tz = DEFAULT_TZ): string {
  const p = localParts(iso, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

type ToleranceSettings = {
  late_tolerance_min: number
  service_tolerance_min?: number | null
  rehearsal_tolerance_min?: number | null
}

/** Linhas de horário de um evento: chegada (limite), passagem de som, início. */
export function eventTimeRows(
  event: {
    kind: string
    starts_at: string
    arrive_at?: string | null
    soundcheck_at?: string | null
  },
  settings?: ToleranceSettings | null,
): { label: string; time: string; strong?: boolean }[] {
  const tolerance =
    (event.kind === 'service'
      ? settings?.service_tolerance_min
      : event.kind === 'rehearsal'
        ? settings?.rehearsal_tolerance_min
        : null) ??
    settings?.late_tolerance_min ??
    null
  const call = event.arrive_at ?? null
  const rows: { label: string; time: string; strong?: boolean }[] = []
  if (call) rows.push({ label: 'Chegada', time: hhmm(call), strong: true })
  if (tolerance != null) {
    const limit = new Date(new Date(call ?? event.starts_at).getTime() + tolerance * 60_000)
    rows.push({ label: 'Limite (tolerância)', time: hhmm(limit.toISOString()) })
  }
  if (event.soundcheck_at) rows.push({ label: 'Passagem de som', time: hhmm(event.soundcheck_at) })
  rows.push({
    label: event.kind === 'rehearsal' ? 'Início do ensaio' : 'Início',
    time: hhmm(event.starts_at),
  })
  return rows
}
