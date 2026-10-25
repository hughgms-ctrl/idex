import { describe, expect, it } from 'vitest'

import {
  beatsPerBar,
  clampRate,
  effectiveBpm,
  formatClock,
  rateForBpm,
} from '@/features/songs/audio-math'

describe('player de áudio', () => {
  it('andamento em BPM e limites', () => {
    expect(effectiveBpm(72, 0.9)).toBe(65)
    expect(rateForBpm(72, 60)).toBe(0.83)
    expect(clampRate(3)).toBe(1.5)
    expect(clampRate(0.1)).toBe(0.5)
  })

  it('relógio', () => {
    expect(formatClock(125.7)).toBe('2:05')
  })

  it('batidas por compasso', () => {
    expect(beatsPerBar('6/8')).toBe(6)
    expect(beatsPerBar(null)).toBe(4)
  })
})
