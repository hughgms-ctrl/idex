import { useCallback, useEffect, useState } from 'react'

// Faixas baixadas ficam guardadas no aparelho (Cache Storage do navegador) até
// a pessoa apagar: abrir a música de novo não baixa nada. Guarda o arquivo
// como foi enviado (MP3: ~1 MB por minuto por faixa), não o áudio aberto.
// A chave é o id do arquivo (`song_files.id`): o link assinado muda a cada vez,
// o id não; arquivo trocado = id novo.

const CACHE = 'idex-multitracks-v1'
const USED_KEY = 'idex:multitracks:baixadas'
const EVENT = 'idex:multitracks-cache'
const keyFor = (fileId: string) => `/__multitracks/${fileId}`

export type TrackDownload = { id: string; url: string; name: string; songId?: string }
export type CachedSong = { songId: string; tracks: number; bytes: number; usedAt: number }

const supported = () => typeof caches !== 'undefined'

function readUsed(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(USED_KEY) ?? '{}') as unknown
    return v && typeof v === 'object' ? (v as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function markUsed(songId: string | undefined, remove = false) {
  if (!songId) return
  try {
    const used = readUsed()
    if (remove) delete used[songId]
    else used[songId] = Date.now()
    localStorage.setItem(USED_KEY, JSON.stringify(used))
  } catch {
    // sem localStorage: só perde a data de uso
  }
}

const changed = () => window.dispatchEvent(new Event(EVENT))

let askedPersist = false
function askPersist() {
  if (askedPersist) return
  askedPersist = true
  // pede para o navegador não apagar sozinho quando faltar espaço
  void navigator.storage?.persist?.().catch(() => false)
}

/** Bytes da faixa: do aparelho, se já baixada; senão baixa e guarda. */
export async function fetchTrack(src: TrackDownload): Promise<ArrayBuffer> {
  if (supported()) {
    try {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(keyFor(src.id))
      if (hit) {
        markUsed(src.songId)
        return await hit.arrayBuffer()
      }
    } catch {
      // cache indisponível: baixa normalmente
    }
  }
  let res: Response
  try {
    res = await fetch(src.url, { cache: 'no-store' })
  } catch {
    throw new Error(`Não foi possível baixar “${src.name}” (internet ou armazenamento).`)
  }
  if (!res.ok) throw new Error(`O link de “${src.name}” venceu (erro ${res.status}).`)
  const bytes = await res.arrayBuffer()
  if (supported()) {
    try {
      askPersist()
      const cache = await caches.open(CACHE)
      await cache.put(
        keyFor(src.id),
        new Response(bytes.slice(0), {
          headers: {
            'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
            'x-song-id': src.songId ?? '',
            'x-size': String(bytes.byteLength),
          },
        }),
      )
      markUsed(src.songId)
      changed()
    } catch {
      // sem espaço: toca do mesmo jeito, só não fica guardada
    }
  }
  return bytes
}

/** Quantas destas faixas já estão no aparelho. */
export async function countCached(fileIds: string[]): Promise<number> {
  if (!supported()) return 0
  try {
    const cache = await caches.open(CACHE)
    const hits = await Promise.all(fileIds.map((id) => cache.match(keyFor(id))))
    return hits.filter(Boolean).length
  } catch {
    return 0
  }
}

/** Músicas com faixas guardadas neste aparelho. */
export async function listCachedSongs(): Promise<CachedSong[]> {
  if (!supported()) return []
  const cache = await caches.open(CACHE)
  const used = readUsed()
  const bySong = new Map<string, CachedSong>()
  for (const req of await cache.keys()) {
    const res = await cache.match(req)
    if (!res) continue
    const songId = res.headers.get('x-song-id') ?? ''
    const bytes = Number(res.headers.get('x-size') ?? 0)
    const row = bySong.get(songId) ?? { songId, tracks: 0, bytes: 0, usedAt: used[songId] ?? 0 }
    row.tracks++
    row.bytes += bytes
    bySong.set(songId, row)
  }
  return [...bySong.values()].sort((a, b) => b.usedAt - a.usedAt)
}

/** Apaga as faixas guardadas de uma música (ou de todas). */
export async function deleteCached(songId?: string): Promise<void> {
  if (!supported()) return
  if (!songId) {
    await caches.delete(CACHE)
    try {
      localStorage.removeItem(USED_KEY)
    } catch {
      // nada
    }
  } else {
    const cache = await caches.open(CACHE)
    for (const req of await cache.keys()) {
      const res = await cache.match(req)
      if (res?.headers.get('x-song-id') === songId) await cache.delete(req)
    }
    markUsed(songId, true)
  }
  changed()
}

/** Lista que se atualiza quando uma faixa é guardada ou apagada. */
export function useCachedSongs() {
  const [songs, setSongs] = useState<CachedSong[] | null>(null)
  const refresh = useCallback(() => {
    void listCachedSongs()
      .then(setSongs)
      .catch(() => setSongs([]))
  }, [])
  useEffect(() => {
    refresh()
    window.addEventListener(EVENT, refresh)
    return () => window.removeEventListener(EVENT, refresh)
  }, [refresh])
  return { songs, refresh, supported: supported() }
}

export function sizeMb(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1024
    ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB`
    : `${Math.max(1, Math.round(mb))} MB`
}
