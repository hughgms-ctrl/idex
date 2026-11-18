import { describe, expect, it } from 'vitest'

import { OVERLAP, segmentToFloat, segmentsBytes, toSegments } from './segments'

const FRAMES = 1000

function tone(length: number, from = 0, to = length): Float32Array {
  const d = new Float32Array(length)
  for (let i = from; i < to; i++) d[i] = 0.5 * Math.sin(i / 7)
  return d
}

describe('toSegments', () => {
  it('não guarda os pedaços em silêncio', () => {
    const segs = toSegments([tone(5000, 2000, 3000)], FRAMES)
    expect(segs.map((s) => s !== null)).toEqual([false, true, true, false, false])
  })

  it('guarda a sobra da emenda e ocupa metade do Float32', () => {
    const segs = toSegments([tone(3000)], FRAMES)
    expect(segs[0]![0]!.length).toBe(FRAMES + OVERLAP)
    expect(segs[2]![0]!.length).toBe(FRAMES)
    expect(segmentsBytes(segs)).toBe((3000 + 2 * OVERLAP) * 2)
  })
})

describe('segmentToFloat', () => {
  it('emenda dois pedaços sem mudar o som', () => {
    const src = tone(3000)
    const segs = toSegments([src], FRAMES)
    const a = segmentToFloat(segs[0]![0]!, 0, FRAMES)
    const b = segmentToFloat(segs[1]![0]!, 1, FRAMES)
    const out = new Float32Array(3000)
    out.set(a.subarray(0, FRAMES + OVERLAP))
    for (let i = 0; i < b.length; i++) out[FRAMES + i]! += b[i]!
    for (let i = 0; i < 2000; i++) expect(Math.abs(out[i]! - src[i]!)).toBeLessThan(1e-4)
  })
})
