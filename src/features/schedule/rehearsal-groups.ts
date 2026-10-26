import type { RehearsalDefaults } from '@domain/schedule.ts'

/** Grupo de ensaio do ministério (ex.: "Ensaio da banda", "Ensaio de vozes"). */
export type RehearsalGroup = {
  id: string
  name: string
  sort_order: number
  role_ids: string[]
  mode: string
  days_before: number
  weekday: number | null
  time: string
  duration_min: number
}

type SettingsLike = RehearsalDefaults & { rehearsal_duration_min: number }

/** Um ensaio que o culto deve ter: de um grupo, ou o único com a equipe toda. */
export type RehearsalSlot = {
  groupId: string | null
  name: string
  defaults: RehearsalDefaults
  durationMin: number
}

/**
 * Os ensaios de cada culto: um por grupo; sem grupos, um só (equipe inteira)
 * com o dia/horário padrão das Configurações.
 */
export function rehearsalSlots(
  settings: SettingsLike | null | undefined,
  groups: RehearsalGroup[] | null | undefined,
): RehearsalSlot[] {
  const list = [...(groups ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
  if (list.length > 0) {
    return list.map((g) => ({
      groupId: g.id,
      name: g.name,
      defaults: {
        rehearsal_days_before: g.days_before,
        rehearsal_time: g.time,
        rehearsal_mode: g.mode,
        rehearsal_weekday: g.weekday,
      },
      durationMin: g.duration_min,
    }))
  }
  return [
    {
      groupId: null,
      name: 'Ensaio',
      defaults: {
        rehearsal_days_before: settings?.rehearsal_days_before ?? 3,
        rehearsal_time: settings?.rehearsal_time ?? '20:00',
        rehearsal_mode: settings?.rehearsal_mode ?? 'days_before',
        rehearsal_weekday: settings?.rehearsal_weekday ?? null,
      },
      durationMin: settings?.rehearsal_duration_min ?? 120,
    },
  ]
}

/** Nome do evento do ensaio: "Ensaio · Culto" ou "Ensaio de vozes · Culto". */
export function rehearsalTitle(groupName: string | null | undefined, serviceTitle: string): string {
  return `${groupName?.trim() || 'Ensaio'} · ${serviceTitle}`
}

const VOICE = /voz|vozes|vocal|back|cant|ministr|soprano|contralto|tenor|bar[ií]tono|coral/i

/** Função de voz (para sugerir a divisão banda × vozes). */
export function isVoiceRole(name: string): boolean {
  return VOICE.test(name)
}

/** Sugestão para "Separar banda e vozes": cada função no seu grupo. */
export function splitBandAndVoices(roles: { id: string; name: string }[]): {
  band: string[]
  voices: string[]
} {
  return {
    band: roles.filter((r) => !isVoiceRole(r.name)).map((r) => r.id),
    voices: roles.filter((r) => isVoiceRole(r.name)).map((r) => r.id),
  }
}

/** Funções que não estão em nenhum grupo (não ensaiam). */
export function rolesWithoutRehearsal<T extends { id: string }>(
  roles: T[],
  groups: Pick<RehearsalGroup, 'role_ids'>[],
): T[] {
  if (groups.length === 0) return []
  const used = new Set(groups.flatMap((g) => g.role_ids))
  return roles.filter((r) => !used.has(r.id))
}
