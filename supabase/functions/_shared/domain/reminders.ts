// Avisos programados de culto e ensaio: quando cada regra dispara.
// Espelha public.reminder_fire_at (SQL), que é quem enfileira de fato.
import { callTime } from './schedule.ts'
import {
  DEFAULT_TZ,
  localParts,
  parseDateKey,
  addDaysToKey,
  localDateKey,
  zonedToUtc,
} from './time.ts'

export type ReminderTiming = 'weekday' | 'days_before' | 'minutes_before'

export type ReminderRule = {
  timing: ReminderTiming
  weekday?: number | null // 0 = domingo
  days_before?: number | null // 0 = no dia
  at_time?: string | null // "09:00"
  minutes_before?: number | null // antes da chegada da equipe
}

/**
 * Instante em que a regra avisa sobre o evento, ou null se cairia na hora
 * da chegada ou depois (ex.: "no dia às 9h" para um evento às 8h).
 * - weekday: no último `weekday` até o dia do evento (inclusive), na hora `at_time`;
 * - days_before: N dias antes, na hora `at_time`;
 * - minutes_before: N minutos antes da chegada (ou do início).
 */
export function reminderFireAt(
  rule: ReminderRule,
  event: { starts_at: string; arrive_at?: string | null },
  tz = DEFAULT_TZ,
): Date | null {
  const call = new Date(callTime(event))
  let at: Date
  if (rule.timing === 'minutes_before') {
    at = new Date(call.getTime() - (rule.minutes_before ?? 0) * 60_000)
  } else {
    const dayKey = localDateKey(event.starts_at, tz)
    const back =
      rule.timing === 'weekday'
        ? (localParts(event.starts_at, tz).weekday - (rule.weekday ?? 1) + 7) % 7
        : (rule.days_before ?? 0)
    const { year, month, day } = parseDateKey(addDaysToKey(dayKey, -back))
    const [h, m] = (rule.at_time ?? '09:00').split(':').map(Number)
    at = zonedToUtc(year, month, day, h ?? 9, m ?? 0, tz)
  }
  return at.getTime() < call.getTime() ? at : null
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** Texto da regra para a tela de Configurações. */
export function describeRule(rule: ReminderRule): string {
  const [h = '9', m = '00'] = (rule.at_time ?? '09:00').split(':')
  const time = `${Number(h)}h${m === '00' ? '' : m}`
  switch (rule.timing) {
    case 'weekday':
      return `Na ${WEEKDAYS[rule.weekday ?? 1]} antes, às ${time}`.replace(
        /^Na (sábado|domingo)/,
        'No $1',
      )
    case 'days_before': {
      const n = rule.days_before ?? 0
      return n === 0 ? `No dia, às ${time}` : `${n} dia${n > 1 ? 's' : ''} antes, às ${time}`
    }
    case 'minutes_before': {
      const n = rule.minutes_before ?? 0
      const label =
        n % 60 === 0 ? `${n / 60} h` : n > 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`
      return `${label} antes da chegada`
    }
  }
}
