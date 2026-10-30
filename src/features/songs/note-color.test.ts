import { describe, expect, it } from 'vitest'

import { NOTE_COLORS, noteColorValue } from '@/features/songs/note-color'

describe('cor das indicações da cifra', () => {
  it('cor escolhida ou roxo neon como padrão', () => {
    expect(noteColorValue('laranja')).toBe('#ff9f45')
    expect(noteColorValue('qualquer')).toBe(NOTE_COLORS[0].value)
    expect(noteColorValue(null)).toBe('#c78bff')
  })
})
