import { describe, expect, it } from 'vitest'

import { distanceMeters, withinRadius } from './geo.ts'

const IGREJA = { lat: -23.55052, lng: -46.633308 }

describe('geolocalização', () => {
  it('mede distância em metros', () => {
    // ~111 m por 0,001 grau de latitude
    expect(Math.round(distanceMeters(IGREJA, { lat: IGREJA.lat + 0.001, lng: IGREJA.lng }))).toBe(
      111,
    )
    expect(distanceMeters(IGREJA, IGREJA)).toBe(0)
  })

  it('aceita dentro do raio com folga limitada pela precisão do GPS', () => {
    const perto = { lat: IGREJA.lat + 0.0027, lng: IGREJA.lng } // ~300 m
    expect(withinRadius({ place: IGREJA, device: perto, accuracyM: 10, radiusM: 300 }).ok).toBe(
      true,
    )
    const longe = { lat: IGREJA.lat + 0.004, lng: IGREJA.lng } // ~445 m
    expect(withinRadius({ place: IGREJA, device: longe, accuracyM: 2000, radiusM: 300 })).toEqual({
      ok: false,
      distanceM: 445,
    })
  })
})
