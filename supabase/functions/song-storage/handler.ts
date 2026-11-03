// Arquivos das músicas no Cloudflare R2: o app pede aqui links
// pré-assinados para enviar (líder), ouvir/baixar (quem é da igreja) e
// apagar (líder). O arquivo vai direto do celular para o R2; o registro
// (nome, BPM, tom) continua em `song_files`, protegido por RLS.
import { z } from 'zod'

import { corsHeaders, errorJson, json } from '../_shared/http.ts'
import { presignUrl, type S3Credentials } from '../_shared/s3presign.ts'

export const R2_MAX_BYTES = 100 * 1024 * 1024
/** Envio em partes (arquivo grande): o R2 exige partes do mesmo tamanho (menos a última). */
export const PART_BYTES = 8 * 1024 * 1024

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
  z.object({
    action: z.literal('multipart_start'),
    songId: z.uuid(),
    fileName: z.string().min(1).max(300),
    contentType: z.string().max(100),
    size: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('multipart_complete'),
    songId: z.uuid(),
    key: z.string().min(1).max(500),
    uploadId: z.string().min(1).max(1000),
    parts: z
      .array(
        z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().max(200) }),
      )
      .min(1)
      .max(10000),
  }),
  z.object({
    action: z.literal('multipart_abort'),
    songId: z.uuid(),
    key: z.string().min(1).max(500),
    uploadId: z.string().min(1).max(1000),
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
  /** Chamada assinada ao R2 feita pelo servidor (envio em partes). */
  s3: (params: {
    method: string
    url: string
    body?: string | Uint8Array
    headers?: Record<string, string>
  }) => Promise<Response>
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

  // Parte de um envio em partes repassada pelo servidor (quando o navegador
  // não consegue mandar direto para o R2: CORS, antivírus, firewall…).
  const query = new URL(req.url).searchParams
  if (query.get('action') === 'part') return relayPart(req, query, authorization, deps)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return errorJson('Pedido inválido', 400)
  const body = parsed.data

  if (body.action === 'config') return json({ r2: Boolean(deps.r2), maxBytes: R2_MAX_BYTES })
  const r2 = deps.r2
  if (!r2) return errorJson('Armazenamento R2 não configurado', 503)

  if (body.action === 'upload' || body.action === 'multipart_start') {
    if (!(await deps.canManageSong(authorization, body.songId))) {
      return errorJson('Só o líder do ministério envia arquivos', 403)
    }
    if (body.size > R2_MAX_BYTES) return errorJson('O arquivo passa de 100 MB', 413)
    if (!ALLOWED.test(body.contentType)) return errorJson('Envie áudio, PDF ou imagem', 415)
    const churchId = await deps.songChurch(body.songId)
    if (!churchId) return errorJson('Música não encontrada', 404)
    const ext = (body.fileName.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const key = `${churchId}/${body.songId}/${deps.uuid()}.${ext || 'bin'}`
    if (body.action === 'upload') {
      const url = await presignUrl({
        method: 'PUT',
        url: objectUrl(r2, key),
        credentials: r2.credentials,
        expiresSeconds: 15 * 60,
      })
      return json({ key, url })
    }
    const res = await deps.s3({
      method: 'POST',
      url: `${objectUrl(r2, key)}?uploads`,
      headers: { 'content-type': body.contentType },
    })
    const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await res.text())?.[1]
    if (!res.ok || !uploadId)
      return errorJson('Não foi possível começar o envio. Tente de novo.', 502)
    const count = Math.ceil(body.size / PART_BYTES)
    const urls: string[] = []
    for (let n = 1; n <= count; n++) {
      urls.push(
        await presignUrl({
          method: 'PUT',
          url: `${objectUrl(r2, key)}?partNumber=${n}&uploadId=${encodeURIComponent(uploadId)}`,
          credentials: r2.credentials,
          expiresSeconds: 60 * 60,
        }),
      )
    }
    return json({ key, uploadId, partSize: PART_BYTES, urls })
  }

  if (body.action === 'multipart_complete' || body.action === 'multipart_abort') {
    if (!(await deps.canManageSong(authorization, body.songId))) {
      return errorJson('Só o líder do ministério envia arquivos', 403)
    }
    const churchId = await deps.songChurch(body.songId)
    // só a chave que este envio criou (pasta da música)
    if (
      !churchId ||
      !body.key.startsWith(`${churchId}/${body.songId}/`) ||
      body.key.includes('..')
    ) {
      return errorJson('Envio inválido', 400)
    }
    const target = `${objectUrl(r2, body.key)}?uploadId=${encodeURIComponent(body.uploadId)}`
    if (body.action === 'multipart_abort') {
      await deps.s3({ method: 'DELETE', url: target })
      return json({ aborted: true })
    }
    const xml = `<CompleteMultipartUpload>${[...body.parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map(
        (p) =>
          `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`,
      )
      .join('')}</CompleteMultipartUpload>`
    const res = await deps.s3({
      method: 'POST',
      url: target,
      body: xml,
      headers: { 'content-type': 'application/xml' },
    })
    const text = await res.text()
    if (!res.ok || /<Error>/.test(text)) {
      return errorJson('Não foi possível juntar as partes do arquivo. Tente de novo.', 502)
    }
    return json({ key: body.key })
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

const partQuery = z.object({
  songId: z.uuid(),
  key: z.string().min(1).max(500),
  uploadId: z.string().min(1).max(1000),
  partNumber: z.coerce.number().int().min(1).max(10000),
})

async function relayPart(
  req: Request,
  query: URLSearchParams,
  authorization: string,
  deps: SongStorageDeps,
): Promise<Response> {
  const r2 = deps.r2
  if (!r2) return errorJson('Armazenamento R2 não configurado', 503)
  const parsed = partQuery.safeParse(Object.fromEntries(query))
  if (!parsed.success) return errorJson('Pedido inválido', 400)
  const p = parsed.data
  if (!(await deps.canManageSong(authorization, p.songId))) {
    return errorJson('Só o líder do ministério envia arquivos', 403)
  }
  const churchId = await deps.songChurch(p.songId)
  if (!churchId || !p.key.startsWith(`${churchId}/${p.songId}/`) || p.key.includes('..')) {
    return errorJson('Envio inválido', 400)
  }
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.length === 0 || bytes.length > PART_BYTES) return errorJson('Parte inválida', 400)
  const res = await deps.s3({
    method: 'PUT',
    url: `${objectUrl(r2, p.key)}?partNumber=${p.partNumber}&uploadId=${encodeURIComponent(p.uploadId)}`,
    body: bytes,
  })
  const etag = res.headers.get('etag')
  if (!res.ok || !etag)
    return errorJson(`O armazenamento recusou a parte (erro ${res.status})`, 502)
  return json({ etag })
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
