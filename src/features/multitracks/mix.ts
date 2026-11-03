import { useSyncExternalStore } from 'react'

// Multitracks: várias faixas (áudios da música) tocando juntas, no mesmo tom
// e andamento. A mixagem é de cada pessoa e fica salva neste aparelho, por
// música. A tela do mixer pode estar em outra janela: as mudanças chegam na
// janela da cifra pelo evento `storage` do navegador.

export type Mix = {
  /** Faixas escolhidas, na ordem do mixer. */
  tracks: string[]
  /** Volume de 0 a 1.5 (1 = original). */
  volume: Record<string, number>
  muted: Record<string, boolean>
  solo: Record<string, boolean>
  /** Na tela da música, tocar as faixas escolhidas (em vez de um áudio só). */
  active: boolean
}

export const EMPTY_MIX: Mix = { tracks: [], volume: {}, muted: {}, solo: {}, active: false }

export const MAX_VOLUME = 1.5

/** Volume efetivo da faixa: solo de alguma faixa cala as outras; mudo cala. */
export function trackGain(mix: Mix, id: string): number {
  if (!mix.tracks.includes(id)) return 0
  const anySolo = mix.tracks.some((t) => mix.solo[t])
  if (anySolo && !mix.solo[id]) return 0
  if (mix.muted[id]) return 0
  return Math.min(MAX_VOLUME, Math.max(0, mix.volume[id] ?? 1))
}

export function toggleTrack(mix: Mix, id: string, order: string[]): Mix {
  const on = mix.tracks.includes(id)
  const set = new Set(on ? mix.tracks.filter((t) => t !== id) : [...mix.tracks, id])
  return { ...mix, tracks: order.filter((t) => set.has(t)) }
}

/** Mantém só faixas que ainda existem (áudio apagado sai da mixagem). */
export function cleanMix(mix: Mix, existing: string[]): Mix {
  const tracks = mix.tracks.filter((t) => existing.includes(t))
  return tracks.length === mix.tracks.length
    ? mix
    : { ...mix, tracks, active: mix.active && tracks.length > 0 }
}

/** Limite de canais de um AudioWorklet no navegador. */
export const MAX_CHANNELS = 32

/** Memória aproximada (MB) das faixas abertas: canais × segundos × taxa × 4 bytes. */
export function memoryMb(channels: number, seconds: number, sampleRate: number): number {
  return Math.round((channels * seconds * sampleRate * 4) / 1_048_576)
}

// --- guardado no aparelho ---

const PREFIX = 'idex:multitracks:'
const listeners = new Set<() => void>()
const cache = new Map<string, Mix>()

function parse(raw: string | null): Mix {
  if (!raw) return EMPTY_MIX
  try {
    const v = JSON.parse(raw) as Partial<Mix>
    return {
      tracks: Array.isArray(v.tracks) ? v.tracks.filter((t) => typeof t === 'string') : [],
      volume: v.volume && typeof v.volume === 'object' ? v.volume : {},
      muted: v.muted && typeof v.muted === 'object' ? v.muted : {},
      solo: v.solo && typeof v.solo === 'object' ? v.solo : {},
      active: !!v.active,
    }
  } catch {
    return EMPTY_MIX
  }
}

export function readMix(songId: string): Mix {
  const hit = cache.get(songId)
  if (hit) return hit
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PREFIX + songId)
  } catch {
    // sem armazenamento: começa vazio
  }
  const mix = parse(raw)
  cache.set(songId, mix)
  return mix
}

export function writeMix(songId: string, mix: Mix) {
  cache.set(songId, mix)
  try {
    localStorage.setItem(PREFIX + songId, JSON.stringify(mix))
  } catch {
    // vale só nesta janela
  }
  listeners.forEach((l) => l())
}

export function updateMix(songId: string, change: (mix: Mix) => Mix) {
  writeMix(songId, change(readMix(songId)))
}

let listening = false
function listenOtherWindows() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith(PREFIX)) return
    cache.set(e.key.slice(PREFIX.length), parse(e.newValue))
    listeners.forEach((l) => l())
  })
}

export function useMix(songId: string): Mix {
  listenOtherWindows()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => readMix(songId),
  )
}
