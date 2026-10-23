import { describe, expect, it } from 'vitest'

import { normalizeKey, parseKey, semitonesBetween, transposeKey } from '@/lib/music'

describe('music', () => {
  it('lê tons maiores, menores, sustenidos e bemóis', () => {
    expect(parseKey('G')).toEqual({ root: 7, minor: false })
    expect(parseKey('Bbm')).toEqual({ root: 10, minor: true })
    expect(parseKey('A#')).toEqual({ root: 10, minor: false })
    expect(parseKey('H')).toBeNull()
  })

  it('transpõe com a grafia usual', () => {
    expect(transposeKey('G', 2)).toBe('A')
    expect(transposeKey('G', 1)).toBe('Ab')
    expect(transposeKey('Em', -1)).toBe('Ebm')
    expect(transposeKey('C', -1)).toBe('B')
    expect(transposeKey('A', 13)).toBe('Bb')
  })

  it('calcula o menor caminho entre dois tons', () => {
    expect(semitonesBetween('G', 'A')).toBe(2)
    expect(semitonesBetween('A', 'G')).toBe(-2)
    expect(semitonesBetween('C', 'F#')).toBe(6)
    expect(semitonesBetween('C', 'G')).toBe(-5)
    expect(semitonesBetween(null, 'G')).toBe(0)
  })

  it('normaliza o que a pessoa digita', () => {
    expect(normalizeKey('bb')).toBe('Bb')
    expect(normalizeKey(' f#m ')).toBe('F#m')
    expect(normalizeKey('A#')).toBe('Bb')
    expect(normalizeKey('x')).toBeNull()
  })
})
