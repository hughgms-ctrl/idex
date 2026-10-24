// Edge Function `r2-admin`: só com a chave de serviço (uso interno, uma vez).
//   { "action": "cors" }    → libera o app (navegador) a enviar/baixar no bucket
//   { "action": "migrate" } → move arquivos do Storage do Supabase para o R2 (lotes de 20)
import { createClient } from '@supabase/supabase-js'

import { corsHeaders, errorJson, json } from '../_shared/http.ts'
import { presignUrl, signedFetch } from '../_shared/s3presign.ts'
import { objectUrl, type R2Config } from '../song-storage/handler.ts'

const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const service = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
  auth: { persistSession: false },
})
const r2: R2Config = Deno.env.get('R2_ACCOUNT_ID')
  ? {
      accountId: Deno.env.get('R2_ACCOUNT_ID') ?? '',
      bucket: Deno.env.get('R2_BUCKET') ?? '',
      credentials: {
        accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
        secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
        region: 'auto',
      },
    }
  : null
const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!serviceKey || token !== serviceKey) return errorJson('Não autorizado', 401)
  if (!r2) return errorJson('R2 não configurado', 503)
  const { action } = (await req.json().catch(() => ({}))) as { action?: string }

  if (action === 'cors') {
    const origins = [appUrl, 'http://localhost:5173', 'https://*.vercel.app'].filter(Boolean)
    const xml = `<CORSConfiguration><CORSRule>${origins
      .map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`)
      .join(
        '',
      )}<AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`
    const res = await signedFetch({
      method: 'PUT',
      url: `https://${r2.accountId}.r2.cloudflarestorage.com/${r2.bucket}?cors=`,
      credentials: r2.credentials,
      body: xml,
      headers: { 'content-type': 'application/xml' },
    })
    return json({ status: res.status, body: (await res.text()).slice(0, 500), origins })
  }

  if (action === 'migrate') {
    const { data: rows, error } = await service
      .from('song_files')
      .select('id, storage_path, mime_type')
      .eq('storage_backend', 'supabase')
      .limit(20)
    if (error) return errorJson(error.message, 500)
    let moved = 0
    const failed: string[] = []
    for (const row of rows ?? []) {
      const { data: blob, error: err } = await service.storage
        .from('song-files')
        .download(row.storage_path)
      if (err || !blob) {
        failed.push(row.id)
        continue
      }
      const put = await fetch(
        await presignUrl({
          method: 'PUT',
          url: objectUrl(r2, row.storage_path),
          credentials: r2.credentials,
          expiresSeconds: 600,
        }),
        {
          method: 'PUT',
          body: blob,
          headers: { 'content-type': row.mime_type ?? 'application/octet-stream' },
        },
      )
      if (!put.ok) {
        failed.push(row.id)
        continue
      }
      await service.from('song_files').update({ storage_backend: 'r2' }).eq('id', row.id)
      await service.storage.from('song-files').remove([row.storage_path])
      moved++
    }
    const { count } = await service
      .from('song_files')
      .select('id', { count: 'exact', head: true })
      .eq('storage_backend', 'supabase')
    return json({ moved, failed, remaining: count ?? 0 })
  }

  return errorJson('Ação desconhecida', 400)
})
