// Edge Function `song-storage` (lógica em handler.ts).
// Segredos: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { createClient } from '@supabase/supabase-js'

import { signedFetch } from '../_shared/s3presign.ts'
import { handleSongStorage, objectUrl, type R2Config } from './handler.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
})
const asUser = (authorization: string) =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

const accountId = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') ?? ''
const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? ''
const bucket = Deno.env.get('R2_BUCKET') ?? ''
const r2: R2Config =
  accountId && accessKeyId && secretAccessKey && bucket
    ? { accountId, bucket, credentials: { accessKeyId, secretAccessKey, region: 'auto' } }
    : null

Deno.serve((req) =>
  handleSongStorage(req, {
    r2,
    getUserId: async (authorization) => {
      if (!authorization) return null
      const { data } = await asUser(authorization).auth.getUser()
      return data?.user?.id ?? null
    },
    canManageSong: async (authorization, songId) => {
      const { data } = await asUser(authorization).rpc('can_manage_song', { p_song_id: songId })
      return data === true
    },
    songChurch: async (songId) => {
      const { data } = await service
        .from('songs')
        .select('church_id')
        .eq('id', songId)
        .maybeSingle()
      return data?.church_id ?? null
    },
    visibleFiles: async (authorization, ids) => {
      const { data, error } = await asUser(authorization)
        .from('song_files')
        .select('id, song_id, storage_path, storage_backend')
        .in('id', ids)
      if (error) throw new Error(error.message)
      return data ?? []
    },
    deleteObject: async (key) => {
      if (!r2) return
      const res = await signedFetch({
        method: 'DELETE',
        url: objectUrl(r2, key),
        credentials: r2.credentials,
      })
      if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`)
    },
    deleteRows: async (ids) => {
      const { error } = await service.from('song_files').delete().in('id', ids)
      if (error) throw new Error(error.message)
    },
    uuid: () => crypto.randomUUID(),
  }),
)
