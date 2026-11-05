import { describe, expect, it } from 'vitest'

import { detectCapo, realKeyFor, stripCapoLines, transposeChordPro } from './capo'
import { chordsOverWordsToChordPro } from './chordpro'

const PASTED = `tom: F# (forma dos acordes no tom de E)
Capotraste na 2ª casa

[Intro] E  B/D#  C#m7  A9

[Primeira Parte]
E              B/D#
Quando a manhã chega devagar
C#m7           A9
Eu me lembro que Tu estás aqui`

describe('capotraste', () => {
  it('acha a casa, a forma e o tom real no texto colado', () => {
    expect(detectCapo(PASTED)).toEqual({ fret: 2, shapeKey: 'E', realKey: 'F#' })
    expect(detectCapo('Capo: 3\nG  D')).toEqual({ fret: 3, shapeKey: null, realKey: null })
    expect(detectCapo('Capotraste na casa 4')?.fret).toBe(4)
    expect(detectCapo('{capo: 1}\n[G]Letra')?.fret).toBe(1)
    expect(detectCapo('G  D\nUma letra qualquer')).toBeNull()
    expect(detectCapo('Capotraste na 0ª casa')).toBeNull()
  })

  it('tom real: o do texto, senão forma + casa, senão o cadastrado', () => {
    expect(realKeyFor({ fret: 2, shapeKey: 'E', realKey: 'F#' })).toBe('F#')
    expect(realKeyFor({ fret: 2, shapeKey: 'E', realKey: null })).toBe('F#')
    expect(realKeyFor({ fret: 3, shapeKey: 'Em', realKey: null })).toBe('Gm')
    expect(realKeyFor({ fret: 2, shapeKey: null, realKey: null }, 'f#')).toBe('F#')
    expect(realKeyFor({ fret: 2, shapeKey: null, realKey: null })).toBeNull()
  })

  it('tira as linhas de capotraste e tom, não a letra', () => {
    const out = stripCapoLines(PASTED)
    expect(out).not.toMatch(/capotraste/i)
    expect(out).not.toMatch(/^tom/im)
    expect(out.startsWith('[Intro]')).toBe(true)
    expect(out).toContain('Quando a manhã chega devagar')
  })

  it('passa os acordes da forma de E para F# (capotraste na 2ª casa)', () => {
    const cp = chordsOverWordsToChordPro(stripCapoLines(PASTED), { key: 'F#' })
    const out = transposeChordPro(cp, 2, 'F#')
    expect(out).toContain('{key: F#}')
    expect(out).toContain('[F#]Quando')
    expect(out).toContain('[C#/F]')
    expect(out).toContain('[D#m7]Eu')
    expect(out).toContain('[B9]')
    expect(out).not.toContain('[E]')
  })

  it('anotações só de acordes sobem; as outras e o texto ficam', () => {
    const cp = '{key: E}\n{capo: 2}\n[*Intro: E A]\n[*Crescendo][E]Glória [Pausa] a [B7/9]Ti'
    const out = transposeChordPro(cp, 2, 'F#')
    expect(out).toBe('{key: F#}\n[*Intro: F# B]\n[*Crescendo][F#]Glória [Pausa] a [C#7/9]Ti')
  })

  it('tom com bemol na armadura escreve bemóis', () => {
    expect(transposeChordPro('[D]A [A]B', 1, 'Eb')).toBe('[Eb]A [Bb]B')
    expect(transposeChordPro('{key: G}\n[G]A', 3, null)).toBe('{key: G}\n[A#]A')
  })
})
