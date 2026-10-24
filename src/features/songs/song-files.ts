import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const BUCKET = 'song-files'
export const MAX_BYTES = 50 * 1024 * 1024

const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export type FileKind = 'audio' | 'pdf' | 'image' | 'other'

/** Tipo do arquivo (alguns celulares não informam o tipo: usa a extensão). */
export function fileInfo(file: { name: string; type: string }): { mime: string; kind: FileKind } {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const mime = file.type || EXT_MIME[ext] || 'application/octet-stream'
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
        .select('id, name, kind, storage_path, size_bytes, bpm, musical_key, created_at')
        .eq('song_id', songId)
        .order('created_at')
      if (error) throw error
      if (data.length === 0) return []
      // links temporários (o bucket é privado)
      const { data: signed, error: err } = await supabase.storage.from(BUCKET).createSignedUrls(
        data.map((f) => f.storage_path),
        6 * 3600,
      )
      if (err) throw err
      const url = new Map(signed.map((s) => [s.path, s.signedUrl]))
      return data.map((f) => ({ ...f, url: url.get(f.storage_path) ?? null }))
    },
    staleTime: 3 * 3600_000,
  })
}

/** Apaga do Storage os arquivos de uma música (antes de apagar a música). */
export async function removeSongStorage(songId: string) {
  const { data } = await supabase.from('song_files').select('storage_path').eq('song_id', songId)
  const paths = (data ?? []).map((f) => f.storage_path)
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
  if (file.size > MAX_BYTES) {
    throw new Error(
      fileInfo(file).kind === 'audio'
        ? `"${file.name}" passa de 50 MB. Exporte em MP3 (fica bem menor) e envie de novo.`
        : `"${file.name}" passa de 50 MB`,
    )
  }
  const { mime, kind } = fileInfo(file)
  if (kind === 'other') throw new Error(`"${file.name}": envie áudio, PDF ou imagem`)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${churchId}/${songId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: mime, upsert: false })
  if (error) throw error
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
  })
  if (err) {
    await supabase.storage.from(BUCKET).remove([path])
    throw err
  }
}
