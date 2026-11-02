import { describe, expect, it } from 'vitest'

import {
  analyzePlan,
  slotNeeds,
  suggestFill,
  totalPerService,
  type CatalogSong,
  type PlannedService,
} from './planning.ts'

const rules = { minWeeksBetweenRepeats: 3, maxNewSongsPerMonth: 1, songsPerService: 3 }
// domingos de novembro/dezembro 2026, 19h SP (22h UTC)
const sun = (d: string) => `${d}T22:00:00.000Z`
const svc = (id: string, date: string, songIds: string[] = []): PlannedService => ({
  eventId: id,
  startsAt: sun(date),
  songIds,
})

describe('análise do plano', () => {
  it('marca repetição em menos de 3 semanas e música nova', () => {
    const r = analyzePlan({
      services: [
        svc('a', '2026-11-01', ['s1', 's2', 's3']),
        svc('b', '2026-11-15', ['s1', 's4', 's5']),
      ],
      history: [
        { songId: 's2', date: sun('2026-09-06') },
        { songId: 's3', date: sun('2026-09-06') },
        { songId: 's4', date: sun('2026-08-02') },
        { songId: 's5', date: sun('2026-08-02') },
      ],
      rules,
    })
    expect(r.flags.get('b')?.[0]).toEqual({ songId: 's1', isNew: false, repeatAfterWeeks: 2 })
    expect(r.flags.get('a')?.[0]).toEqual({ songId: 's1', isNew: true, repeatAfterWeeks: null })
    expect(r.alerts).toContainEqual({ kind: 'repeat', eventId: 'b', songId: 's1', weeks: 2 })
    expect(r.stats).toEqual({ distinct: 5, newCount: 1, ruleBreaks: 1 })
  })

  it('alerta mais músicas novas que o permitido no mês e culto incompleto', () => {
    const r = analyzePlan({ services: [svc('a', '2026-11-01', ['n1', 'n2'])], history: [], rules })
    expect(r.alerts).toContainEqual({ kind: 'too_many_new', month: '2026-11', count: 2, max: 1 })
    expect(r.alerts).toContainEqual({ kind: 'missing_songs', eventId: 'a', missing: 1 })
  })
})

describe('sugerir', () => {
  const catalog: CatalogSong[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'N'].map((t) => ({
    id: t,
    title: `Música ${t}`,
  }))
  const history = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id, i) => ({
    songId: id,
    date: sun(`2026-0${(i % 7) + 1}-05`),
  }))

  it('completa sem repetir dentro de 3 semanas, priorizando quem está há mais tempo sem tocar', () => {
    const services = [
      svc('a', '2026-11-01'),
      svc('b', '2026-11-08'),
      svc('c', '2026-11-15'),
      svc('d', '2026-11-22'),
    ]
    const added = suggestFill({ services, history, catalog, rules })
    expect(added.get('a')).toEqual(['A', 'B', 'C'])
    expect(added.get('b')).toEqual(['D', 'E', 'F'])
    // em 15/11 só sobra G conhecida; a nova N entra (1 por mês); A/B/C ainda < 3 semanas
    expect(added.get('c')).toEqual(['G', 'N'])
    expect(added.get('d')).toEqual(['A', 'B', 'C'])
    const result = analyzePlan({
      services: services.map((s) => ({ ...s, songIds: added.get(s.eventId) ?? [] })),
      history,
      rules,
    })
    expect(result.alerts.filter((a) => a.kind === 'repeat' || a.kind === 'too_many_new')).toEqual(
      [],
    )
  })

  it('sem histórico, só conta como nova a música marcada pelo líder', () => {
    const services = [svc('a', '2026-11-01'), svc('b', '2026-11-08')]
    const fresh = ['A', 'B', 'C', 'D', 'E', 'F', 'N', 'M'].map((t) => ({
      id: t,
      title: `Música ${t}`,
    }))
    const newSongIds = new Set(['N', 'M'])
    const added = suggestFill({ services, history: [], catalog: fresh, rules, newSongIds })
    expect(
      [...(added.get('a') ?? []), ...(added.get('b') ?? [])].filter((id) => newSongIds.has(id)),
    ).toHaveLength(0)
    expect(added.get('a')).toHaveLength(3)
    expect(added.get('b')).toHaveLength(3)
    const r = analyzePlan({
      services: [svc('a', '2026-11-01', ['A', 'N', 'M'])],
      history: [],
      rules,
      newSongIds,
    })
    expect(r.alerts).toContainEqual({ kind: 'too_many_new', month: '2026-11', count: 2, max: 1 })
    expect(r.flags.get('a')?.map((f) => f.isNew)).toEqual([false, true, true])
  })

  it('respeita o que o ministro já escolheu', () => {
    const added = suggestFill({
      services: [svc('a', '2026-11-01', ['G'])],
      history,
      catalog,
      rules,
    })
    expect(added.get('a')).toEqual(['A', 'B'])
  })
})

describe('estrutura do culto por tipo', () => {
  const CEL = 'cat-celebracao'
  const ADO = 'cat-adoracao'
  const slots = [
    { categoryId: CEL, count: 2 },
    { categoryId: ADO, count: 2 },
  ]
  const typed = { ...rules, maxNewSongsPerMonth: 10, songsPerService: 3, slots }
  const categories: Record<string, string[]> = {
    c1: [CEL],
    c2: [CEL],
    c3: [CEL],
    a1: [ADO],
    a2: [ADO, CEL],
    a3: [ADO],
    x1: [],
  }
  const catalog: CatalogSong[] = Object.keys(categories).map((id) => ({ id, title: id }))

  it('o total é o maior entre músicas por culto e a soma das partes', () => {
    expect(totalPerService(typed)).toBe(4)
    expect(totalPerService({ ...typed, songsPerService: 6 })).toBe(6)
  })

  it('conta o que falta em cada parte (cada música ocupa uma parte só)', () => {
    expect(slotNeeds(['c1', 'a2'], slots, categories)).toEqual([0, 2])
    expect(slotNeeds(['c1', 'c2', 'a2'], slots, categories)).toEqual([0, 1])
    expect(slotNeeds(['x1'], slots, categories)).toEqual([2, 2])
  })

  it('preenche cada parte com o tipo certo, na ordem', () => {
    const fill = suggestFill({
      services: [svc('a', '2026-11-01')],
      history: [],
      catalog,
      rules: typed,
      categories,
    })
    const added = fill.get('a') ?? []
    expect(added).toHaveLength(4)
    expect(added.slice(0, 2).every((id) => (categories[id] ?? []).includes(CEL))).toBe(true)
    expect(added.slice(2).every((id) => (categories[id] ?? []).includes(ADO))).toBe(true)
  })

  it('completa só o que falta e avisa o tipo que ficou sem música', () => {
    const services = [svc('a', '2026-11-01', ['c1', 'c2'])]
    const fill = suggestFill({ services, history: [], catalog, rules: typed, categories })
    expect(fill.get('a')).toHaveLength(2)
    expect((fill.get('a') ?? []).every((id) => (categories[id] ?? []).includes(ADO))).toBe(true)

    const r = analyzePlan({ services, history: [], rules: typed, categories })
    expect(r.alerts).toContainEqual({
      kind: 'missing_category',
      eventId: 'a',
      categoryId: ADO,
      missing: 2,
    })
    expect(r.stats.ruleBreaks).toBe(0)
  })

  it('sem músicas do tipo, completa o total com qualquer música', () => {
    const fill = suggestFill({
      services: [svc('a', '2026-11-01')],
      history: [],
      catalog: [
        { id: 'x1', title: 'x1' },
        { id: 'c1', title: 'c1' },
      ],
      rules: typed,
      categories,
    })
    expect(fill.get('a')).toEqual(['c1', 'x1'])
  })
})
