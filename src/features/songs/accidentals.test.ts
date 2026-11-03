import { describe, expect, it } from 'vitest'

import { accidentalsForKey, resolveAccidentals, spellChord, transposeChord } from './accidentals'
import { readChordPro, transposeNote } from './chordpro'

describe('accidentalsForKey', () => {
  it('tons com bemol na armadura usam bemóis', () => {
    for (const k of ['Bb', 'Eb', 'Ab', 'F', 'Gm', 'Dm', 'Cm'])
      expect(accidentalsForKey(k)).toBe('flat')
  })
  it('tons com sustenido usam sustenidos', () => {
    for (const k of ['G', 'D', 'E', 'B', 'F#', 'Em', 'C#m'])
      expect(accidentalsForKey(k)).toBe('sharp')
  })
  it('C, Am e tom desconhecido mantêm a grafia', () => {
    expect(accidentalsForKey('C')).toBeNull()
    expect(accidentalsForKey('Am')).toBeNull()
    expect(accidentalsForKey(null)).toBeNull()
  })
  it('escolha manual vale mais que o tom', () => {
    expect(resolveAccidentals('sharp', 'Bb')).toBe('sharp')
    expect(resolveAccidentals('auto', 'Bb')).toBe('flat')
  })
})

describe('spellChord', () => {
  it('troca raiz e baixo', () => {
    expect(spellChord('A#m7/D#', 'flat')).toBe('Bbm7/Eb')
    expect(spellChord('Bb/D', 'sharp')).toBe('A#/D')
    expect(spellChord('(D#9)', 'flat')).toBe('(Eb9)')
    expect(spellChord('E7/9', 'flat')).toBe('E7/9')
    expect(spellChord('Gsus4', 'flat')).toBe('Gsus4')
    expect(spellChord('A#', null)).toBe('A#')
  })
  it('transpõe acorde escrito como texto', () => {
    expect(transposeChord('Gm', 2, 'sharp')).toBe('Am')
    expect(transposeChord('A#', 2, 'flat')).toBe('C')
    expect(transposeChord('F', 1, 'flat')).toBe('Gb')
  })
})

describe('cifra com grafia escolhida', () => {
  const cifra = '{key: Bb}\n[*Introd: Gm A# F]\n[Gm]Meu Deus é minha [D#]luz e salva[A#]ção'
  it('bemóis: D# vira Eb e A# vira Bb, inclusive na anotação', () => {
    const [section] = readChordPro(cifra, 0, 'flat')
    const segs = section!.lines.flatMap((l) => l.segments)
    expect(segs.map((s) => s.chord).filter(Boolean)).toEqual(['Gm', 'Eb', 'Bb'])
    expect(segs.find((s) => s.note)?.note).toBe('Introd: Gm Bb F')
  })
  it('anotação comum não muda', () => {
    expect(transposeNote('Crescendo', 2, 'flat')).toBe('Crescendo')
    expect(transposeNote('2x', 2, 'flat')).toBe('2x')
    expect(transposeNote('Intro: Gm A# F', 2, 'sharp')).toBe('Intro: Am C G')
  })
})
