import { describe, expect, it } from 'vitest'

import {
  busShift,
  cleanMix,
  EMPTY_MIX,
  memoryMb,
  toggleTrack,
  trackGain,
  trackKind,
  type Mix,
} from './mix'

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

describe('trackKind', () => {
  it('click e guia não mudam de tom', () => {
    expect(trackKind('Click')).toBe('fixed')
    expect(trackKind('01_click.wav')).toBe('fixed')
    expect(trackKind('Guia')).toBe('fixed')
    expect(trackKind('Metrônomo')).toBe('fixed')
    expect(trackKind('CUE')).toBe('fixed')
    expect(trackKind('Click Track')).toBe('fixed')
    expect(trackKind('Guide')).toBe('fixed')
  })
  it('vozes', () => {
    expect(trackKind('Voz tenor')).toBe('voice')
    expect(trackKind('Vocal')).toBe('voice')
    expect(trackKind('BV')).toBe('voice')
    expect(trackKind('Back vocal')).toBe('voice')
    expect(trackKind('BGVS')).toBe('voice')
    expect(trackKind('Choir')).toBe('voice')
  })
  it('instrumentos', () => {
    expect(trackKind('Baixo')).toBe('instrument')
    expect(trackKind('Bateria')).toBe('instrument')
    expect(trackKind('Teclado Pad')).toBe('instrument')
    expect(trackKind('Guitarra')).toBe('instrument')
    expect(trackKind('Drums (Live)')).toBe('instrument')
    expect(trackKind('EG 1')).toBe('instrument')
    expect(trackKind('FX')).toBe('instrument')
    expect(trackKind('Dulcimer')).toBe('instrument')
  })
})

describe('busShift', () => {
  it('no original não processa', () => {
    expect(busShift('instrument', 0, 1)).toBe(0)
    expect(busShift('fixed', 3, 1)).toBe(0)
  })
  it('tom muda instrumentos e vozes, não click/guia', () => {
    expect(busShift('instrument', 2, 1)).toBe(2)
    expect(busShift('voice', -3, 1)).toBe(-3)
  })
  it('andamento: desfaz a mudança de tom do playbackRate', () => {
    expect(busShift('fixed', 0, 2)).toBeCloseTo(-12)
    expect(busShift('instrument', 2, 0.5)).toBeCloseTo(14)
    expect(busShift('voice', 0, 1.1)).toBeCloseTo(-12 * Math.log2(1.1))
  })
})
