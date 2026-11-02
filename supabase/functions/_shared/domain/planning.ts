// Planejamento trimestral do repertório (funções puras).
// - Não repetir uma música em menos de N semanas.
// - No máximo M músicas novas por mês. Nova = marcada pelo líder como "a banda
//   ainda está aprendendo" (newSongIds) e contada no mês da estreia. Sem a
//   lista, qualquer música nunca usada conta como nova.
// - Cada culto com K músicas; "sugerir" completa as lacunas respeitando tudo.
// - Estrutura do culto por tipo (opcional): ex.: 2 de celebração, depois 3 de
//   adoração. Cada parte é preenchida com músicas daquele tipo.
import { DEFAULT_TZ, localDateKey } from './time.ts'

export type CategorySlot = { categoryId: string; count: number }

export type PlanRules = {
  minWeeksBetweenRepeats: number
  maxNewSongsPerMonth: number
  songsPerService: number
  /** estrutura do culto por tipo, em ordem (vazio = sem regra de tipo) */
  slots?: CategorySlot[]
}

/** Tipos de cada música (id da música → ids dos tipos). Objeto simples. */
export type SongCategories = Record<string, readonly string[]>

/** Total de músicas do culto: o maior entre "músicas por culto" e a soma das partes. */
export function totalPerService(rules: PlanRules): number {
  const slots = (rules.slots ?? []).reduce((n, s) => n + s.count, 0)
  return Math.max(rules.songsPerService, slots)
}

/**
 * Quantas músicas ainda faltam em cada parte do culto, dadas as que já estão
 * nele. Cada música ocupa no máximo uma parte (a primeira, na ordem, do tipo
 * dela que ainda tem vaga).
 */
export function slotNeeds(
  songIds: readonly string[],
  slots: readonly CategorySlot[],
  categories: SongCategories,
): number[] {
  const left = slots.map((s) => s.count)
  for (const id of songIds) {
    const cats = categories[id] ?? []
    const i = slots.findIndex((s, k) => (left[k] ?? 0) > 0 && cats.includes(s.categoryId))
    if (i >= 0) left[i] = (left[i] ?? 0) - 1
  }
  return left
}

export type PlannedService = { eventId: string; startsAt: string; songIds: string[] }
export type Usage = { songId: string; date: string } // usos anteriores ao período (histórico)
export type CatalogSong = { id: string; title: string }

export type SongFlag = { songId: string; isNew: boolean; repeatAfterWeeks: number | null }

export type PlanAlert =
  | { kind: 'repeat'; eventId: string; songId: string; weeks: number }
  | { kind: 'too_many_new'; month: string; count: number; max: number }
  | { kind: 'missing_songs'; eventId: string; missing: number }
  | { kind: 'missing_category'; eventId: string; categoryId: string; missing: number }

const DAY = 86_400_000

const monthOf = (iso: string, tz: string) => localDateKey(iso, tz).slice(0, 7)

function allUsages(services: PlannedService[], history: Usage[]): Usage[] {
  return [
    ...history,
    ...services.flatMap((s) => s.songIds.map((songId) => ({ songId, date: s.startsAt }))),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

function firstUse(usages: Usage[]): Map<string, string> {
  const first = new Map<string, string>()
  for (const u of usages) if (!first.has(u.songId)) first.set(u.songId, u.date)
  return first
}

/** Marca músicas novas e repetições e lista as quebras de regra. */
export function analyzePlan(params: {
  services: PlannedService[]
  history: Usage[]
  rules: PlanRules
  newSongIds?: ReadonlySet<string>
  categories?: SongCategories
  tz?: string
}): {
  flags: Map<string, SongFlag[]>
  alerts: PlanAlert[]
  stats: { distinct: number; newCount: number; ruleBreaks: number }
  newPerMonth: Map<string, number>
} {
  const { history, rules, newSongIds, tz = DEFAULT_TZ } = params
  const services = [...params.services].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const usages = allUsages(services, history)
  const first = firstUse(usages)
  const flags = new Map<string, SongFlag[]>()
  const alerts: PlanAlert[] = []
  const newPerMonth = new Map<string, number>()
  const minDays = rules.minWeeksBetweenRepeats * 7

  for (const s of services) {
    const list: SongFlag[] = []
    for (const songId of s.songIds) {
      const isNew = first.get(songId) === s.startsAt && (!newSongIds || newSongIds.has(songId))
      if (isNew)
        newPerMonth.set(
          monthOf(s.startsAt, tz),
          (newPerMonth.get(monthOf(s.startsAt, tz)) ?? 0) + 1,
        )
      const previous = usages.filter((u) => u.songId === songId && u.date < s.startsAt).at(-1)
      let repeatAfterWeeks: number | null = null
      if (previous) {
        const days = Math.round((Date.parse(s.startsAt) - Date.parse(previous.date)) / DAY)
        if (days < minDays) {
          repeatAfterWeeks = Math.max(0, Math.floor(days / 7))
          alerts.push({ kind: 'repeat', eventId: s.eventId, songId, weeks: repeatAfterWeeks })
        }
      }
      list.push({ songId, isNew, repeatAfterWeeks })
    }
    flags.set(s.eventId, list)
    const total = totalPerService(rules)
    if (s.songIds.length < total) {
      alerts.push({
        kind: 'missing_songs',
        eventId: s.eventId,
        missing: total - s.songIds.length,
      })
    }
    const slots = rules.slots ?? []
    slotNeeds(s.songIds, slots, params.categories ?? {}).forEach((missing, i) => {
      const slot = slots[i]
      if (slot && missing > 0)
        alerts.push({
          kind: 'missing_category',
          eventId: s.eventId,
          categoryId: slot.categoryId,
          missing,
        })
    })
  }
  for (const [month, count] of newPerMonth) {
    if (count > rules.maxNewSongsPerMonth)
      alerts.push({ kind: 'too_many_new', month, count, max: rules.maxNewSongsPerMonth })
  }
  const planSongs = new Set(services.flatMap((s) => s.songIds))
  return {
    flags,
    alerts,
    newPerMonth,
    stats: {
      distinct: planSongs.size,
      newCount: [...newPerMonth.values()].reduce((a, b) => a + b, 0),
      ruleBreaks: alerts.filter((a) => a.kind === 'repeat' || a.kind === 'too_many_new').length,
    },
  }
}

/**
 * Completa os cultos. Com estrutura por tipo, primeiro preenche cada parte
 * (na ordem) com músicas daquele tipo; depois completa até o total com
 * qualquer música. Prefere músicas já conhecidas e há mais tempo sem tocar;
 * só usa música nova se o mês ainda tem vaga; nunca repete dentro do
 * intervalo mínimo (antes ou depois). Devolve só o que foi acrescentado em
 * cada culto, na ordem das partes.
 */
export function suggestFill(params: {
  services: PlannedService[]
  history: Usage[]
  catalog: CatalogSong[]
  rules: PlanRules
  newSongIds?: ReadonlySet<string>
  categories?: SongCategories
  tz?: string
}): Map<string, string[]> {
  const { history, catalog, rules, newSongIds, tz = DEFAULT_TZ } = params
  const categories = params.categories ?? {}
  const slots = rules.slots ?? []
  const total = totalPerService(rules)
  const markedNew = (id: string) => !newSongIds || newSongIds.has(id)
  const services = [...params.services]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((s) => ({ ...s, songIds: [...s.songIds] }))
  const added = new Map<string, string[]>()
  const minMs = rules.minWeeksBetweenRepeats * 7 * DAY

  /** melhor música para o culto (só do tipo, se indicado); null se não há */
  const pickFor = (s: (typeof services)[number], categoryId: string | null) => {
    const usages = allUsages(services, history)
    const first = firstUse(usages)
    const month = monthOf(s.startsAt, tz)
    const newThisMonth = services
      .filter((x) => monthOf(x.startsAt, tz) === month)
      .flatMap((x) =>
        x.songIds.filter((id) => first.get(id) === x.startsAt && markedNew(id)),
      ).length
    const t = Date.parse(s.startsAt)

    const candidates = catalog
      .filter((song) => !s.songIds.includes(song.id))
      .filter((song) => !categoryId || (categories[song.id] ?? []).includes(categoryId))
      .filter((song) =>
        usages.every((u) => u.songId !== song.id || Math.abs(Date.parse(u.date) - t) >= minMs),
      )
      .map((song) => {
        const used = usages.filter((u) => u.songId === song.id && u.date < s.startsAt)
        const known =
          !markedNew(song.id) || (first.has(song.id) && (first.get(song.id) ?? '') < s.startsAt)
        return { song, known, lastUsed: used.at(-1)?.date ?? '' }
      })
      .filter((c) => c.known || newThisMonth < rules.maxNewSongsPerMonth)
      .sort(
        (a, b) =>
          Number(b.known) - Number(a.known) ||
          a.lastUsed.localeCompare(b.lastUsed) ||
          a.song.title.localeCompare(b.song.title, 'pt-BR'),
      )

    return candidates[0]?.song.id ?? null
  }
  const add = (s: (typeof services)[number], songId: string) => {
    s.songIds.push(songId)
    added.set(s.eventId, [...(added.get(s.eventId) ?? []), songId])
  }

  for (const s of services) {
    // 1) cada parte do culto, na ordem, com músicas do tipo
    slots.forEach((slot, i) => {
      let need = slotNeeds(s.songIds, slots, categories)[i] ?? 0
      while (need > 0 && s.songIds.length < total) {
        const id = pickFor(s, slot.categoryId)
        if (!id) break
        add(s, id)
        need = slotNeeds(s.songIds, slots, categories)[i] ?? 0
      }
    })
    // 2) o resto até o total, com qualquer música
    while (s.songIds.length < total) {
      const id = pickFor(s, null)
      if (!id) break
      add(s, id)
    }
  }
  return added
}
