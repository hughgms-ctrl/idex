import { describe, expect, it } from 'vitest'

import { cleanMix, EMPTY_MIX, memoryMb, toggleTrack, trackGain, type Mix } from './mix'

const mix = (over: Partial<Mix>): Mix => ({ ...EMPTY_MIX, ...over })

describe('trackGain', () => {
  it('volume da faixa, limitado a 150%', () => {
    expect(trackGain(mix({ tracks: ['a'], volume: { a: 0.5 } }), 'a')).toBe(0.5)
    expect(trackGain(mix({ tracks: ['a'], volume: { a: 3 } }), 'a')).toBe(1.5)
    expect(trackGain(mix({ tracks: ['a'] }), 'a')).toBe(1)
  })
  it('faixa fora da mixagem ou muda fica calada', () => {
    expect(trackGain(mix({ tracks: ['a'] }), 'b')).toBe(0)
    expect(trackGain(mix({ tracks: ['a'], muted: { a: true } }), 'a')).toBe(0)
  })
  it('solo cala as outras', () => {
    const m = mix({ tracks: ['a', 'b', 'c'], solo: { b: true } })
    expect(trackGain(m, 'a')).toBe(0)
    expect(trackGain(m, 'b')).toBe(1)
    expect(trackGain(m, 'c')).toBe(0)
  })
  it('solo de faixa que saiu da mixagem não cala ninguém', () => {
    expect(trackGain(mix({ tracks: ['a'], solo: { x: true } }), 'a')).toBe(1)
  })
})

describe('toggleTrack e cleanMix', () => {
  it('mantém a ordem do mixer', () => {
    const m = toggleTrack(mix({ tracks: ['c'] }), 'a', ['a', 'b', 'c'])
    expect(m.tracks).toEqual(['a', 'c'])
    expect(toggleTrack(m, 'c', ['a', 'b', 'c']).tracks).toEqual(['a'])
  })
  it('faixa apagada sai; sem faixas, desliga', () => {
    const m = cleanMix(mix({ tracks: ['a', 'x'], active: true }), ['a'])
    expect(m.tracks).toEqual(['a'])
    expect(cleanMix(mix({ tracks: ['x'], active: true }), ['a']).active).toBe(false)
  })
})

describe('memoryMb', () => {
  it('memória aproximada', () => {
    expect(memoryMb(2, 300, 44100)).toBe(101)
  })
})
