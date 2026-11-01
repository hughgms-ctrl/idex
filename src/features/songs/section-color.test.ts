import { describe, expect, it } from 'vitest'

import { sectionColor, sectionKind } from '@/features/songs/section-color'

describe('cor da seção da cifra', () => {
  it('reconhece a parte pelo nome, sem ligar para acento, caixa e número', () => {
    expect(sectionKind('Verso')).toBe('verse')
    expect(sectionKind('VERSO 2')).toBe('verse')
    expect(sectionKind('Primeira Parte')).toBe('verse')
    expect(sectionKind('Refrão (2x)')).toBe('chorus')
    expect(sectionKind('refrao')).toBe('chorus')
    expect(sectionKind('Coro')).toBe('chorus')
    expect(sectionKind('Pré-Refrão')).toBe('prechorus')
    expect(sectionKind('Pre-chorus')).toBe('prechorus')
    expect(sectionKind('Ponte')).toBe('bridge')
    expect(sectionKind('Intro')).toBe('intro')
    expect(sectionKind('Introdução')).toBe('intro')
    expect(sectionKind('Final')).toBe('intro')
    expect(sectionKind('Solo')).toBe('intro')
  })

  it('nome desconhecido fica neutro', () => {
    expect(sectionKind('Testifico - Barak')).toBe('other')
    expect(sectionKind('Presença')).toBe('other')
    expect(sectionKind('Refrãozinho')).toBe('other')
  })

  it('mesma parte, mesma cor', () => {
    expect(sectionColor('Verso 1')).toBe(sectionColor('Segunda Parte'))
    expect(sectionColor('Refrão')).not.toBe(sectionColor('Verso'))
  })
})
