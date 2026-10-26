import { useQuery } from '@tanstack/react-query'

import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'

export const BUCKET = 'song-files'
/** Limite no Storage do Supabase (plano gratuito). */
export const MAX_BYTES = 50 * 1024 * 1024
/** Limite no Cloudflare R2. */
export const R2_MAX_BYTES = 100 * 1024 * 1024

// O app usa o R2 quando ele estiver configurado no servidor; senão, o Supabase.
let r2Enabled: Promise<boolean> | null = null
export function isR2Enabled(): Promise<boolean> {
  r2Enabled ??= invokeFunction<{ r2: boolean }>('song-storage', { action: 'config' })
    .then((c) => c.r2)
    .catch(() => {
      r2Enabled = null // tenta de novo na próxima vez
      return false
    })
  return r2Enabled
}

export type StoredFile = { id: string; storage_path: string; storage_backend: string }

const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  // MP3 salvo como .mpeg/.mpga (o navegador diz que é vídeo)
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export type FileKind = 'audio' | 'pdf' | 'image' | 'other'

/**
 * Tipo do arquivo. Alguns celulares não informam o tipo e o Windows chama
 * ".mpeg" de vídeo: com extensão de áudio conhecida, vale a extensão.
 */
export function fileInfo(file: { name: string; type: string }): { mime: string; kind: FileKind } {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExt = EXT_MIME[ext]
  const mime =
    byExt?.startsWith('audio/') && !file.type.startsWith('audio/')
      ? byExt
      : file.type || byExt || 'application/octet-stream'
  const kind: FileKind = mime.startsWith('audio/')
    ? 'audio'
    : mime === 'application/pdf'
      ? 'pdf'
      : mime.startsWith('image/')
        ? 'image'
        : 'other'
  return { mime, kind }
}

export const songFileKeys = {
  list: (songId: string) => ['song-files', songId] as const,
}

export function useSongFiles(songId: string) {
  return useQuery({
    queryKey: songFileKeys.list(songId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_files')
        .select(
          'id, name, kind, storage_path, storage_backend, size_bytes, bpm, musical_key, created_at',
        )
        .eq('song_id', songId)
        .order('created_at')
      if (error) throw error
      if (data.length === 0) return []
      // links temporários (tudo é privado): Supabase e R2
      const url = new Map<string, string>()
      const local = data.filter((f) => f.storage_backend !== 'r2')
      const remote = data.filter((f) => f.storage_backend === 'r2')
      if (local.length) {
        const { data: signed, error: err } = await supabase.storage.from(BUCKET).createSignedUrls(
          local.map((f) => f.storage_path),
          6 * 3600,
        )
        if (err) throw err
        const byPath = new Map(signed.map((x) => [x.path, x.signedUrl]))
        for (const f of local) {
          const u = byPath.get(f.storage_path)
          if (u) url.set(f.id, u)
        }
      }
      if (remote.length) {
        const { urls } = await invokeFunction<{ urls: Record<string, string> }>('song-storage', {
          action: 'download',
          fileIds: remote.map((f) => f.id),
        })
        for (const [id, u] of Object.entries(urls)) url.set(id, u)
      }
      return data.map((f) => ({ ...f, url: url.get(f.id) ?? null }))
    },
    staleTime: 3 * 3600_000,
  })
}

/** Apaga um arquivo (onde quer que esteja) e o registro dele. */
export async function deleteSongFile(file: StoredFile): Promise<void> {
  if (file.storage_backend === 'r2') {
    await invokeFunction('song-storage', { action: 'delete', fileIds: [file.id] })
    return
  }
  const { error } = await supabase.storage.from(BUCKET).remove([file.storage_path])
  if (error) throw error
  const { error: err } = await supabase.from('song_files').delete().eq('id', file.id)
  if (err) throw err
}

/** Apaga os arquivos de uma música (antes de apagar a música). */
export async function removeSongStorage(songId: string) {
  const { data } = await supabase
    .from('song_files')
    .select('id, storage_path, storage_backend')
    .eq('song_id', songId)
  const rows = data ?? []
  const remote = rows.filter((f) => f.storage_backend === 'r2').map((f) => f.id)
  if (remote.length) await invokeFunction('song-storage', { action: 'delete', fileIds: remote })
  const paths = rows.filter((f) => f.storage_backend !== 'r2').map((f) => f.storage_path)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

export function sizeLabel(bytes: number | null): string {
  if (!bytes) return ''
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.ceil(bytes / 1024)} KB`
}

/** Envia um arquivo da música (Storage + registro). Áudio pode levar BPM e tom. */
export async function uploadSongFile(params: {
  churchId: string
  songId: string
  file: File
  name?: string
  bpm?: number | null
  musicalKey?: string | null
}): Promise<void> {
  const { churchId, songId, file } = params
  const { mime, kind } = fileInfo(file)
  if (kind === 'other') throw new Error(`"${file.name}": envie áudio, PDF ou imagem`)
  const useR2 = await isR2Enabled()
  const limit = useR2 ? R2_MAX_BYTES : MAX_BYTES
  if (file.size > limit) {
    const mb = Math.round(limit / 1024 / 1024)
    throw new Error(
      kind === 'audio'
        ? `"${file.name}" passa de ${mb} MB. Exporte em MP3 (fica bem menor) e envie de novo.`
        : `"${file.name}" passa de ${mb} MB`,
    )
  }
  let path: string
  if (useR2) {
    // o arquivo vai direto do aparelho para o R2, por um link de 15 minutos
    const { key, url } = await invokeFunction<{ key: string; url: string }>('song-storage', {
      action: 'upload',
      songId,
      fileName: file.name,
      contentType: mime,
      size: file.size,
    })
    const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': mime } })
    if (!put.ok) throw new Error('Não foi possível enviar o arquivo. Tente de novo.')
    path = key
  } else {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    path = `${churchId}/${songId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: mime, upsert: false })
    if (error) throw error
  }
  const { error: err } = await supabase.from('song_files').insert({
    church_id: churchId,
    song_id: songId,
    name: (params.name?.trim() || file.name).slice(0, 200),
    kind,
    storage_path: path,
    mime_type: mime,
    size_bytes: file.size,
    bpm: kind === 'audio' ? (params.bpm ?? null) : null,
    musical_key: kind === 'audio' ? (params.musicalKey ?? null) : null,
    storage_backend: useR2 ? 'r2' : 'supabase',
  })
  if (err) {
    if (!useR2) await supabase.storage.from(BUCKET).remove([path])
    throw err
  }
}
