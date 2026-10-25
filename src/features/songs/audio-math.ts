// Contas do player de áudio (puras, testáveis).

/** BPM tocando com a velocidade escolhida. */
export function effectiveBpm(bpm: number, rate: number): number {
  return Math.round(bpm * rate)
}

/** Velocidade para chegar num BPM alvo (limitada a 50%–150%). */
export function rateForBpm(originalBpm: number, targetBpm: number): number {
  return clampRate(targetBpm / originalBpm)
}

export function clampRate(rate: number): number {
  return Math.min(1.5, Math.max(0.5, Math.round(rate * 100) / 100))
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Tempos de compasso: "4/4" → 4 batidas; "6/8" → 6. */
export function beatsPerBar(timeSignature: string | null | undefined): number {
  const n = Number(timeSignature?.split('/')[0])
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 4
}
