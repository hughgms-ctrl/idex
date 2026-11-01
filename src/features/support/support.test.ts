import { describe, expect, it } from 'vitest'

import { serviceKey, serviceSemitones, songHeading, teamByRole } from './support'

describe('tom do culto', () => {
  it('usa o tom que o líder definiu na setlist', () => {
    const item = { key: 'A', songs: { original_key: 'G' } }
    expect(serviceKey(item)).toBe('A')
    expect(serviceSemitones(item)).toBe(2)
  })

  it('sem tom na setlist, fica no original', () => {
    const item = { key: null, songs: { original_key: 'G' } }
    expect(serviceKey(item)).toBe('G')
    expect(serviceSemitones(item)).toBe(0)
  })

  it('desce pelo caminho mais curto', () => {
    expect(serviceSemitones({ key: 'F', songs: { original_key: 'G' } })).toBe(-2)
    expect(serviceSemitones({ key: 'Em', songs: { original_key: 'Am' } })).toBe(-5)
  })

  it('música sem tom cadastrado não transpõe', () => {
    const item = { key: 'D', songs: { original_key: null } }
    expect(serviceKey(item)).toBe('D')
    expect(serviceSemitones(item)).toBe(0)
  })
})

describe('equipe por função', () => {
  it('agrupa na ordem das funções e tira quem não vai', () => {
    const team = [
      { status: 'scheduled', role: 'Vocal', rolePosition: 2, name: 'Bia' },
      { status: 'confirmed', role: 'Bateria', rolePosition: 1, name: 'Caio' },
      { status: 'scheduled', role: 'Vocal', rolePosition: 2, name: 'Ana' },
      { status: 'declined', role: 'Baixo', rolePosition: 0, name: 'Davi' },
      { status: 'benched', role: 'Vocal', rolePosition: 2, name: 'Eva' },
    ]
    expect(teamByRole(team)).toEqual([
      { role: 'Bateria', names: ['Caio'] },
      { role: 'Vocal', names: ['Ana', 'Bia'] },
    ])
  })
})

describe('texto copiado', () => {
  it('título com o tom do culto', () => {
    expect(songHeading(1, 'Grande é o Senhor', 'A')).toBe('1. Grande é o Senhor — Tom: A')
    expect(songHeading(2, 'Sem tom', null)).toBe('2. Sem tom')
  })
})
