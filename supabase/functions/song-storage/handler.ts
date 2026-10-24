// Arquivos das músicas no Cloudflare R2: o app pede aqui links
// pré-assinados para enviar (líder), ouvir/baixar (quem é da igreja) e
// apagar (líder). O arquivo vai direto do celular para o R2; o registro
// (nome, BPM, tom) continua em `song_files`, protegido por RLS.
import { z } from 'zod'

import { corsHeaders, errorJson, json } from '../_shared/http.ts'
import { presignUrl, type S3Credentials } from '../_shared/s3presign.ts'

export const R2_MAX_BYTES = 100 * 1024 * 1024

const ALLOWED = /^(audio\/[a-z0-9.+-]+|application\/pdf|image\/(jpeg|png|webp))$/

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('config') }),
  z.object({
    action: z.literal('upload'),
    songId: z.uuid(),
    fileName: z.string().min(1).max(300),
    contentType: z.string().max(100),
    size: z.number().int().positive(),
  }),
  z.object({ action: z.literal('download'), fileIds: z.array(z.uuid()).min(1).max(200) }),
  z.object({ action: z.literal('delete'), fileIds: z.array(z.uuid()).min(1).max(200) }),
])

export type R2Config = { accountId: string; bucket: string; credentials: S3Credentials } | null

export type FileRow = {
  id: string
  song_id: string
  storage_path: string
  storage_backend: string
}

export type SongStorageDeps = {
  r2: R2Config
  getUserId: (authorization: string) => Promise<string | null>
  canManageSong: (authorization: string, songId: string) => Promise<boolean>
  songChurch: (songId: string) => Promise<string | null>
  /** linhas que o usuário enxerga (RLS: só da igreja dele) */
  visibleFiles: (authorization: string, ids: string[]) => Promise<FileRow[]>
  deleteObject: (key: string) => Promise<void>
  deleteRows: (ids: string[]) => Promise<void>
  uuid: () => string
}

export function objectUrl(r2: NonNullable<R2Config>, key: string): string {
  return `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucket}/${key}`
}

export async function handleSongStorage(req: Request, deps: SongStorageDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return errorJson('Método não permitido', 405)

  const authorization = req.headers.get('Authorization') ?? ''
  if (!(await deps.getUserId(authorization))) return errorJson('Entre na sua conta', 401)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJson('Pedido inválido', 400)
  const body = parsed.data

  if (body.action === 'config') return json({ r2: Boolean(deps.r2), maxBytes: R2_MAX_BYTES })
  const r2 = deps.r2
  if (!r2) return errorJson('Armazenamento R2 não configurado', 503)

  if (body.action === 'upload') {
    if (!(await deps.canManageSong(authorization, body.songId))) {
      return errorJson('Só o líder do ministério envia arquivos', 403)
    }
    if (body.size > R2_MAX_BYTES) return errorJson('O arquivo passa de 100 MB', 413)
    if (!ALLOWED.test(body.contentType)) return errorJson('Envie áudio, PDF ou imagem', 415)
    const churchId = await deps.songChurch(body.songId)
    if (!churchId) return errorJson('Música não encontrada', 404)
    const ext = (body.fileName.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const key = `${churchId}/${body.songId}/${deps.uuid()}.${ext || 'bin'}`
    const url = await presignUrl({
      method: 'PUT',
      url: objectUrl(r2, key),
      credentials: r2.credentials,
      expiresSeconds: 15 * 60,
    })
    return json({ key, url })
  }

  const rows = (await deps.visibleFiles(authorization, body.fileIds)).filter(
    (r) => r.storage_backend === 'r2',
  )

  if (body.action === 'download') {
    const urls: Record<string, string> = {}
    for (const r of rows) {
      urls[r.id] = await presignUrl({
        method: 'GET',
        url: objectUrl(r2, r.storage_path),
        credentials: r2.credentials,
        expiresSeconds: 6 * 3600,
      })
    }
    return json({ urls })
  }

  // delete: só arquivos de músicas que o usuário lidera
  const allowed: FileRow[] = []
  for (const r of rows) {
    if (await deps.canManageSong(authorization, r.song_id)) allowed.push(r)
  }
  if (allowed.length < rows.length) return errorJson('Só o líder do ministério apaga arquivos', 403)
  for (const r of allowed) await deps.deleteObject(r.storage_path)
  await deps.deleteRows(allowed.map((r) => r.id))
  return json({ deleted: allowed.length })
}
