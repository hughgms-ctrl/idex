// Distância entre coordenadas (haversine) e verificação do raio de check-in.

const EARTH_RADIUS_M = 6_371_000

export type Coords = { lat: number; lng: number }

export function distanceMeters(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Está dentro do raio? Dá uma folga de até 50 m pela imprecisão do GPS
 * (dentro de prédios a precisão costuma piorar).
 */
export function withinRadius(params: {
  place: Coords
  device: Coords
  accuracyM: number | null
  radiusM: number
}): { ok: boolean; distanceM: number } {
  const distanceM = Math.round(distanceMeters(params.place, params.device))
  const slack = Math.min(Math.max(params.accuracyM ?? 0, 0), 50)
  return { ok: distanceM <= params.radiusM + slack, distanceM }
}
