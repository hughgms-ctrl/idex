import { describe, expect, it } from 'vitest'

import {
  chordsOverWordsToChordPro,
  looksLikeChordPro,
  readChordPro,
} from '@/features/songs/chordpro'

const COLADO = `Intro: G D

Verso 1
G          D
Quando a manhã chega devagar
Em              C
Eu me lembro que Tu estás aqui

Refrão
G         D
Fiel, Tu és fiel`

describe('chordpro', () => {
  it('converte acordes sobre a letra para ChordPro, com seções', () => {
    const pro = chordsOverWordsToChordPro(COLADO, { title: 'Fiel', key: 'G' })
    expect(pro).toContain('{title: Fiel}')
    expect(pro).toContain('{key: G}')
    expect(pro).toContain('{comment: Verso 1}')
    expect(pro).toContain('{comment: Refrão}')
    expect(pro).toMatch(/\[G\]Quando/)
    expect(looksLikeChordPro(pro)).toBe(true)
    expect(looksLikeChordPro(COLADO)).toBe(false)
  })

  it('lê seções e transpõe', () => {
    const pro = chordsOverWordsToChordPro(COLADO, { key: 'G' })
    const sections = readChordPro(pro, 2)
    const refrao = sections.find((s) => s.label === 'Refrão')
    const line = refrao?.lines[0]?.segments ?? []
    expect(line.map((s) => s.lyrics).join('')).toBe('Fiel, Tu és fiel')
    expect(line.map((s) => s.chord).filter(Boolean)).toEqual(['A', 'E'])
    expect(sections.map((s) => s.label)).toContain('Verso 1')
  })

  it('entende blocos de refrão do ChordPro', () => {
    const sections = readChordPro('{start_of_chorus}\n[C]Santo, [G/B]santo\n{end_of_chorus}')
    expect(sections[0]?.label).toBe('Refrão')
    expect(sections[0]?.lines[0]?.segments.map((s) => s.chord)).toEqual(['C', 'G/B'])
  })
})
