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
