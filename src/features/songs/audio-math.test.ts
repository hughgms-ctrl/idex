import { describe, expect, it } from 'vitest'

import {
  beatsPerBar,
  clampRate,
  effectiveBpm,
  formatClock,
  pitchShiftFor,
  positionAt,
  rateForBpm,
} from '@/features/songs/audio-math'

describe('player de áudio', () => {
  it('mudar o andamento não muda o tom (compensa o pitch)', () => {
    expect(pitchShiftFor(0, 1)).toBe(0)
    expect(pitchShiftFor(0, 2)).toBeCloseTo(-12)
    expect(pitchShiftFor(2, 0.8)).toBeCloseTo(2 + 3.863, 2)
  })

  it('andamento em BPM e limites', () => {
    expect(effectiveBpm(72, 0.9)).toBe(65)
    expect(rateForBpm(72, 60)).toBe(0.83)
    expect(clampRate(3)).toBe(1.5)
    expect(clampRate(0.1)).toBe(0.5)
  })

  it('posição e relógio', () => {
    expect(positionAt({ offset: 10, startedAt: 100, now: 104, rate: 0.5, duration: 200 })).toBe(12)
    expect(positionAt({ offset: 190, startedAt: 0, now: 50, rate: 1, duration: 200 })).toBe(200)
    expect(formatClock(125.7)).toBe('2:05')
  })

  it('batidas por compasso', () => {
    expect(beatsPerBar('6/8')).toBe(6)
    expect(beatsPerBar(null)).toBe(4)
  })
})
