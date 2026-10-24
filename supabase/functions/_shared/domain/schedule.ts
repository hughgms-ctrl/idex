// Regras da escala: recorrência de eventos, indisponibilidade, conflitos,
// elegibilidade do ciclo e sugestão de substituto. Funções puras.
import {
  addDaysToKey,
  DEFAULT_TZ,
  localDateKey,
  localParts,
  parseDateKey,
  zonedToUtc,
} from './time.ts'

export const DEFAULT_EVENT_DURATION_MIN = 120

export type EventLike = { id: string; starts_at: string; ends_at: string | null }

export type Unavailability = {
  ministry_member_id: string
  starts_at: string
  ends_at: string
  recurrence_rule: string | null
}

/** Resposta do membro para um evento: pode (true) ou não pode (false). */
export type AvailabilityAnswer = {
  event_id: string
  ministry_member_id: string
  available: boolean
}

export function answerFor(
  memberId: string,
  eventId: string,
  answers: AvailabilityAnswer[] | undefined,
): boolean | null {
  const a = answers?.find((x) => x.event_id === eventId && x.ministry_member_id === memberId)
  return a ? a.available : null
}

export type Assignment = {
  id?: string
  event_id: string
  ministry_member_id: string
  ministry_role_id: string | null
}

export type MemberLike = {
  id: string
  name: string
  status: 'active' | 'inactive'
  roleIds: string[]
}

export type EligibilityInfo = {
  /** existe algum ciclo fechado do ministério? (no primeiro ciclo todos são elegíveis) */
  hasClosedCycle: boolean
  /** membros avaliados no último fechamento */
  evaluated: ReadonlySet<string>
  /** membros elegíveis no último fechamento */
  eligible: ReadonlySet<string>
}

/**
 * Horário de referência das regras (atraso, abertura do ponto, "esqueci"):
 * a chegada da equipe, se o líder definiu; senão, o início do evento.
 */
export function callTime(event: { starts_at: string; arrive_at?: string | null }): string {
  return event.arrive_at ?? event.starts_at
}

export function eventEnd(event: Pick<EventLike, 'starts_at' | 'ends_at'>): Date {
  return event.ends_at
    ? new Date(event.ends_at)
    : new Date(new Date(event.starts_at).getTime() + DEFAULT_EVENT_DURATION_MIN * 60_000)
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

// ---------------------------------------------------------------------------
// Recorrência semanal de eventos
// ---------------------------------------------------------------------------

/**
 * Datas de um evento semanal: a partir de `firstDate` (YYYY-MM-DD), repetindo
 * a cada `intervalWeeks` semanas até `untilDate` (inclusive), no máximo `max`.
 * Devolve os instantes UTC do início, respeitando o fuso.
 */
export function weeklyOccurrences(params: {
  firstDate: string
  time: string // HH:MM
  untilDate: string
  intervalWeeks?: number
  max?: number
  tz?: string
}): Date[] {
  const { firstDate, time, untilDate, intervalWeeks = 1, max = 104, tz = DEFAULT_TZ } = params
  const [hh, mm] = time.split(':').map(Number)
  const out: Date[] = []
  for (
    let key = firstDate;
    key <= untilDate && out.length < max;
    key = addDaysToKey(key, 7 * intervalWeeks)
  ) {
    const { year, month, day } = parseDateKey(key)
    out.push(zonedToUtc(year, month, day, hh ?? 0, mm ?? 0, tz))
  }
  return out
}

// ---------------------------------------------------------------------------
// Indisponibilidade
// ---------------------------------------------------------------------------

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Regra semanal (RRULE simplificada): FREQ=WEEKLY;BYDAY=SU,WE */
export function buildWeeklyRule(weekdays: number[]): string {
  const days = [...new Set(weekdays)].sort().map((d) => BYDAY[d])
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`
}

export function parseWeeklyRule(rule: string | null | undefined): number[] | null {
  if (!rule) return null
  const match = rule.match(/FREQ=WEEKLY;BYDAY=([A-Z,]+)/)
  if (!match?.[1]) return null
  return match[1]
    .split(',')
    .map((d) => BYDAY.indexOf(d))
    .filter((d) => d >= 0)
}

/**
 * O período de indisponibilidade cobre o evento?
 * - Sem recorrência: intervalo [starts_at, ends_at) cruza o evento.
 * - Semanal: o dia (no fuso) do evento cai num dos dias da semana marcados e
 *   está entre a data inicial e a final da regra (dia inteiro).
 */
export function unavailabilityCovers(
  u: Pick<Unavailability, 'starts_at' | 'ends_at' | 'recurrence_rule'>,
  event: Pick<EventLike, 'starts_at' | 'ends_at'>,
  tz = DEFAULT_TZ,
): boolean {
  const start = new Date(event.starts_at)
  const end = eventEnd(event)
  const weekdays = parseWeeklyRule(u.recurrence_rule)
  if (!weekdays) return overlaps(new Date(u.starts_at), new Date(u.ends_at), start, end)
  const dayKey = localDateKey(start, tz)
  if (
    dayKey < localDateKey(u.starts_at, tz) ||
    dayKey > localDateKey(new Date(new Date(u.ends_at).getTime() - 1), tz)
  ) {
    return false
  }
  return weekdays.includes(localParts(start, tz).weekday)
}

export function isUnavailable(
  memberId: string,
  event: Pick<EventLike, 'starts_at' | 'ends_at'>,
  unavailability: Unavailability[],
  tz = DEFAULT_TZ,
): boolean {
  return unavailability.some(
    (u) => u.ministry_member_id === memberId && unavailabilityCovers(u, event, tz),
  )
}

// ---------------------------------------------------------------------------
// Elegibilidade do ciclo
// ---------------------------------------------------------------------------

/**
 * Só entra na escala quem ficou elegível no último fechamento. No primeiro
 * ciclo (nenhum fechado) todos são elegíveis; quem entrou depois do último
 * fechamento (não foi avaliado) também.
 */
export function isEligible(memberId: string, info: EligibilityInfo): boolean {
  if (!info.hasClosedCycle) return true
  if (!info.evaluated.has(memberId)) return true
  return info.eligible.has(memberId)
}

// ---------------------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------------------

export type ConflictKind =
  'unavailable' | 'double_booked' | 'ineligible' | 'inactive' | 'missing_role'

export type Conflict = { kind: ConflictKind; message: string; otherEventId?: string }

export function assignmentConflicts(params: {
  member: MemberLike
  roleId: string | null
  event: EventLike
  events: EventLike[]
  assignments: Assignment[]
  unavailability: Unavailability[]
  eligibility: EligibilityInfo
  /** respostas "posso / não posso" (sem resposta = pode ser escalado) */
  answers?: AvailabilityAnswer[]
  tz?: string
}): Conflict[] {
  const {
    member,
    roleId,
    event,
    events,
    assignments,
    unavailability,
    eligibility,
    answers,
    tz = DEFAULT_TZ,
  } = params
  const out: Conflict[] = []
  if (member.status !== 'active')
    out.push({ kind: 'inactive', message: `${member.name} está inativo.` })
  if (!isEligible(member.id, eligibility)) {
    out.push({ kind: 'ineligible', message: `${member.name} não ficou elegível no último ciclo.` })
  }
  // A resposta para a data vale mais que o período de indisponibilidade
  const answer = answerFor(member.id, event.id, answers)
  if (answer === false) {
    out.push({ kind: 'unavailable', message: `${member.name} disse que não pode nesta data.` })
  } else if (answer === null && isUnavailable(member.id, event, unavailability, tz)) {
    out.push({ kind: 'unavailable', message: `${member.name} marcou indisponibilidade.` })
  }
  if (roleId && !member.roleIds.includes(roleId)) {
    out.push({ kind: 'missing_role', message: `${member.name} não tem essa função cadastrada.` })
  }
  const byId = new Map(events.map((e) => [e.id, e]))
  const start = new Date(event.starts_at)
  const end = eventEnd(event)
  for (const a of assignments) {
    if (a.ministry_member_id !== member.id || a.event_id === event.id) continue
    const other = byId.get(a.event_id)
    if (other && overlaps(start, end, new Date(other.starts_at), eventEnd(other))) {
      out.push({
        kind: 'double_booked',
        message: `${member.name} já está escalado no mesmo horário.`,
        otherEventId: other.id,
      })
      break
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Sugestão de substituto
// ---------------------------------------------------------------------------

export type Suggestion = {
  member: MemberLike
  assignmentsInMonth: number
  /** disse "posso" para esta data */
  confirmed: boolean
}

/**
 * Candidatos para uma função num evento: ativos, com a função, disponíveis,
 * elegíveis no ciclo e livres no horário; primeiro quem disse "posso", depois
 * quem foi menos escalado no mês (empate: ordem alfabética).
 */
export function suggestSubstitutes(params: {
  roleId: string | null
  event: EventLike
  members: MemberLike[]
  events: EventLike[] // eventos do mês (para contar e checar choque)
  assignments: Assignment[] // escalas do mês
  unavailability: Unavailability[]
  eligibility: EligibilityInfo
  answers?: AvailabilityAnswer[]
  exclude?: string[]
  limit?: number
  tz?: string
}): Suggestion[] {
  const { roleId, event, members, events, assignments, exclude = [], limit = 3 } = params
  const alreadyInEvent = new Set(
    assignments.filter((a) => a.event_id === event.id).map((a) => a.ministry_member_id),
  )
  const monthEventIds = new Set(events.map((e) => e.id))
  const counts = new Map<string, number>()
  for (const a of assignments) {
    if (!monthEventIds.has(a.event_id)) continue
    counts.set(a.ministry_member_id, (counts.get(a.ministry_member_id) ?? 0) + 1)
  }
  return members
    .filter((m) => !exclude.includes(m.id) && !alreadyInEvent.has(m.id))
    .filter((m) => (roleId ? m.roleIds.includes(roleId) : true))
    .filter((m) => assignmentConflicts({ ...params, member: m }).length === 0)
    .map((m) => ({
      member: m,
      assignmentsInMonth: counts.get(m.id) ?? 0,
      confirmed: answerFor(m.id, event.id, params.answers) === true,
    }))
    .sort(
      (a, b) =>
        Number(b.confirmed) - Number(a.confirmed) ||
        a.assignmentsInMonth - b.assignmentsInMonth ||
        a.member.name.localeCompare(b.member.name, 'pt-BR'),
    )
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Chegada e ensaio de cada culto
// ---------------------------------------------------------------------------

export type ServiceDefaults = {
  service_arrival_minutes: number
  rehearsal_days_before: number
  rehearsal_time: string // HH:MM ou HH:MM:SS
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
const fromMinutes = (total: number) => {
  const t = ((total % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** Horário padrão (HH:MM) X minutos antes de `time` (chegada, passagem de som). */
export function defaultArrival(time: string, minutesBefore: number): string {
  return fromMinutes(toMinutes(time) - Math.max(0, minutesBefore))
}

export type RehearsalDefaults = {
  rehearsal_days_before: number
  rehearsal_time: string
  /** 'days_before' = N dias antes; 'weekday' = no último <dia da semana> antes do culto */
  rehearsal_mode?: 'days_before' | 'weekday' | string
  rehearsal_weekday?: number | null
}

/**
 * Data/hora padrão do ensaio de um culto no dia `dateKey`: N dias antes, ou
 * no último <dia da semana> antes do culto (mesmo dia da semana = mesmo dia).
 */
export function defaultRehearsal(
  dateKey: string,
  defaults: RehearsalDefaults,
): { date: string; time: string } {
  let days = defaults.rehearsal_days_before
  if (defaults.rehearsal_mode === 'weekday' && defaults.rehearsal_weekday != null) {
    const { year, month, day } = parseDateKey(dateKey)
    const serviceWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    days = (serviceWeekday - defaults.rehearsal_weekday + 7) % 7
  }
  return { date: addDaysToKey(dateKey, -days), time: defaults.rehearsal_time.slice(0, 5) }
}

/** Quantos dias o ensaio fica antes do culto (para repetir nas outras semanas). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey)
  const b = parseDateKey(toKey)
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  )
}

// ---------------------------------------------------------------------------
// Continuar uma repetição semanal
// ---------------------------------------------------------------------------

type Times = {
  starts_at: string
  ends_at: string | null
  arrive_at?: string | null
  soundcheck_at?: string | null
}
export type SeriesOccurrence = {
  starts_at: string
  ends_at: string | null
  arrive_at: string | null
  soundcheck_at: string | null
  rehearsal: { starts_at: string; ends_at: string | null; arrive_at: string | null } | null
}

/**
 * Próximas semanas de uma série que parou antes de `untilKey` (inclusive):
 * copia do último evento o horário (no fuso), a duração, a chegada e a
 * passagem de som (em minutos antes do início) e, se ele tinha ensaio, o
 * ensaio na mesma distância em dias e no mesmo horário.
 */
export function extendWeeklySeries(params: {
  last: Times
  lastRehearsal?: Times | null
  untilKey: string
  tz?: string
}): SeriesOccurrence[] {
  const { last, lastRehearsal, untilKey, tz = DEFAULT_TZ } = params
  const start = new Date(last.starts_at).getTime()
  const minutesBeforeStart = (iso: string | null | undefined) =>
    iso ? Math.round((start - new Date(iso).getTime()) / 60_000) : null
  const duration = last.ends_at ? new Date(last.ends_at).getTime() - start : null
  const arrival = minutesBeforeStart(last.arrive_at)
  const soundcheck = minutesBeforeStart(last.soundcheck_at)
  const p = localParts(last.starts_at, tz)
  const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  const lastKey = localDateKey(last.starts_at, tz)

  const reh = lastRehearsal
    ? (() => {
        const rs = new Date(lastRehearsal.starts_at).getTime()
        const rp = localParts(lastRehearsal.starts_at, tz)
        return {
          daysBefore: daysBetweenKeys(localDateKey(lastRehearsal.starts_at, tz), lastKey),
          time: `${String(rp.hour).padStart(2, '0')}:${String(rp.minute).padStart(2, '0')}`,
          duration: lastRehearsal.ends_at ? new Date(lastRehearsal.ends_at).getTime() - rs : null,
          arrival: lastRehearsal.arrive_at
            ? Math.round((rs - new Date(lastRehearsal.arrive_at).getTime()) / 60_000)
            : null,
        }
      })()
    : null

  const minus = (d: Date, min: number | null) =>
    min == null ? null : new Date(d.getTime() - min * 60_000).toISOString()
  const plus = (d: Date, ms: number | null) =>
    ms == null ? null : new Date(d.getTime() + ms).toISOString()

  return weeklyOccurrences({
    firstDate: addDaysToKey(lastKey, 7),
    time,
    untilDate: untilKey,
    tz,
  }).map((d) => {
    let rehearsal: SeriesOccurrence['rehearsal'] = null
    if (reh) {
      const day = parseDateKey(addDaysToKey(localDateKey(d, tz), -reh.daysBefore))
      const [hh, mm] = reh.time.split(':').map(Number)
      const rs = zonedToUtc(day.year, day.month, day.day, hh ?? 0, mm ?? 0, tz)
      rehearsal = {
        starts_at: rs.toISOString(),
        ends_at: plus(rs, reh.duration),
        arrive_at: minus(rs, reh.arrival),
      }
    }
    return {
      starts_at: d.toISOString(),
      ends_at: plus(d, duration),
      arrive_at: minus(d, arrival),
      soundcheck_at: minus(d, soundcheck),
      rehearsal,
    }
  })
}
