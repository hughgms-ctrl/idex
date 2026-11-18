import { describe, expect, it } from 'vitest'

import { trailFor, type TrailRow } from './presence-trail'

const base = { root_id: 'c', distance_m: null, minutes: null, delivered: null }
const rows: TrailRow[] = [
  {
    ...base,
    event_id: 'c',
    event_title: 'Culto de Domingo',
    at: '2026-11-15T17:57:00Z',
    what: 'attempt',
    detail: 'outside_radius',
    distance_m: 459.2,
  },
  {
    ...base,
    event_id: 'e',
    event_title: 'Ensaio de vozes',
    at: '2026-11-15T19:19:00Z',
    what: 'checkin',
    detail: 'geo',
    minutes: 9,
  },
  {
    ...base,
    event_id: 'c',
    event_title: 'Culto de Domingo',
    at: '2026-11-15T23:10:00Z',
    what: 'notice',
    detail: 'after',
    delivered: true,
  },
  {
    ...base,
    root_id: 'x',
    event_id: 'x',
    event_title: 'Outro',
    at: '2026-11-08T12:00:00Z',
    what: 'checkin',
    detail: 'qr',
  },
]

describe('registro da presença', () => {
  it('junta culto e ensaios do mesmo culto, em ordem, com horário de São Paulo', () => {
    expect(trailFor(rows, 'c', 'c')).toEqual([
      '15/11 14:57 · tentou: fora do raio (a 459 m)',
      '15/11 16:19 · no Ensaio de vozes · presença registrada (9 min depois da chegada)',
      '15/11 20:10 · avisado "presença não registrada" (depois)',
    ])
  })

  it('sem nada no culto, devolve lista vazia', () => {
    expect(trailFor(rows, 'z', 'z')).toEqual([])
  })
})
