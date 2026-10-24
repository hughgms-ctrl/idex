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
        .select('id, name, kind, storage_path, size_bytes, created_at')
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
