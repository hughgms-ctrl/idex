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
          'id, name, kind, storage_path, storage_backend, size_bytes, bpm, musical_key, is_default, created_at',
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
  /** Áudio que abre no player para todos. */
  isDefault?: boolean
  /** Progresso do envio (0 a 1). */
  onProgress?: (fraction: number) => void
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
    // o arquivo vai direto do aparelho para o R2. Grande (WAV): em partes de
    // 8 MB, cada uma com novas tentativas (um envio só de 80 MB caía no meio).
    path =
      file.size > MULTIPART_FROM
        ? await uploadInParts(songId, file, mime, params.onProgress)
        : await uploadWhole(songId, file, mime, params.onProgress)
  } else {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    path = `${churchId}/${songId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: mime, upsert: false })
    if (error) throw error
  }
  const { data: row, error: err } = await supabase
    .from('song_files')
    .insert({
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
    .select('id')
    .single()
  if (err) {
    if (!useR2) await supabase.storage.from(BUCKET).remove([path])
    throw err
  }
  if (kind === 'audio' && params.isDefault) await setDefaultAudio(row.id)
}

/** Acima disso o envio vai em partes. */
const MULTIPART_FROM = 16 * 1024 * 1024

async function uploadWhole(
  songId: string,
  file: File,
  mime: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { key, url } = await invokeFunction<{ key: string; url: string }>('song-storage', {
    action: 'upload',
    songId,
    fileName: file.name,
    contentType: mime,
    size: file.size,
  })
  await putWithProgress(url, file, mime, onProgress)
  return key
}

async function uploadInParts(
  songId: string,
  file: File,
  mime: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const start = await invokeFunction<{
    key: string
    uploadId: string
    partSize: number
    urls: string[]
  }>('song-storage', {
    action: 'multipart_start',
    songId,
    fileName: file.name,
    contentType: mime,
    size: file.size,
  })
  const { key, uploadId, partSize, urls } = start
  const sent = new Array<number>(urls.length).fill(0)
  const report = () => onProgress?.(sent.reduce((a, b) => a + b, 0) / file.size)
  const etags: { partNumber: number; etag: string }[] = []
  try {
    // 3 partes ao mesmo tempo; cada parte tenta até 4 vezes
    let next = 0
    const worker = async () => {
      while (next < urls.length) {
        const i = next++
        const blob = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize))
        let etag: string | null = null
        for (let attempt = 1; !etag; attempt++) {
          try {
            etag = await putPart(urls[i]!, blob, (loaded) => {
              sent[i] = loaded
              report()
            })
          } catch (err) {
            sent[i] = 0
            report()
            if (attempt >= 4) throw err
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
          }
        }
        etags.push({ partNumber: i + 1, etag })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    await invokeFunction('song-storage', {
      action: 'multipart_complete',
      songId,
      key,
      uploadId,
      parts: etags,
    })
    return key
  } catch (err) {
    void invokeFunction('song-storage', { action: 'multipart_abort', songId, key, uploadId }).catch(
      () => undefined,
    )
    const mb = (file.size / 1024 / 1024).toFixed(0)
    throw new Error(
      `Não foi possível enviar "${file.name}" (${mb} MB): ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      { cause: err },
    )
  }
}

/** Envia uma parte e devolve o ETag (o R2 libera esse cabeçalho pelo CORS). */
function putPart(url: string, blob: Blob, onLoaded: (bytes: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => onLoaded(e.loaded)
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('ETag')
      if (xhr.status >= 200 && xhr.status < 300 && etag) {
        onLoaded(blob.size)
        return resolve(etag)
      }
      reject(
        new Error(
          xhr.status >= 200 && xhr.status < 300
            ? 'o armazenamento não devolveu a confirmação da parte (ETag)'
            : `o armazenamento recusou uma parte (erro ${xhr.status})`,
        ),
      )
    }
    xhr.onerror = () => reject(new Error('a conexão caiu várias vezes'))
    xhr.ontimeout = xhr.onerror
    xhr.send(blob)
  })
}

/**
 * Envia o arquivo direto para o armazenamento (R2) mostrando o progresso.
 * Arquivo grande (WAV) leva minutos: o `fetch` não mostra progresso e, se a
 * conexão cai no meio, só dizia "sem conexão com o servidor".
 */
function putWithProgress(
  url: string,
  file: File,
  mime: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const mb = (file.size / 1024 / 1024).toFixed(0)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      const code = /<Code>([^<]+)<\/Code>/.exec(xhr.responseText ?? '')?.[1]
      reject(
        new Error(
          `O armazenamento recusou "${file.name}" (erro ${xhr.status}${code ? `, ${code}` : ''}). Tente de novo.`,
        ),
      )
    }
    xhr.onerror = () =>
      reject(
        new Error(
          `A conexão caiu no meio do envio de "${file.name}" (${mb} MB). Tente de novo numa internet estável` +
            (/\.wav$/i.test(file.name)
              ? ' ou exporte em MP3 (fica cerca de 10 vezes menor).'
              : '.'),
        ),
      )
    xhr.ontimeout = xhr.onerror
    xhr.send(file)
  })
}

/** Marca o áudio que abre no player para todos (desmarca o anterior). */
export async function setDefaultAudio(fileId: string, isDefault = true): Promise<void> {
  const { error } = await supabase.rpc('set_default_song_audio', {
    p_file_id: fileId,
    p_default: isDefault,
  })
  if (error) throw error
}

/** Áudio que abre no player: o marcado como padrão ou, sem marcação, o primeiro enviado. */
export function defaultAudio<T extends { is_default?: boolean | null }>(
  audios: T[],
): T | undefined {
  return audios.find((a) => a.is_default) ?? audios[0]
}
