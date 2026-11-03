import { describe, expect, it } from 'vitest'

import { handleSongStorage, type SongStorageDeps } from './handler.ts'

const SONG = '0b6f6f8e-3c1a-4d2a-9f4b-1a2b3c4d5e6f'
const FILE = '6f1c2a4e-1111-4111-8111-000000000001'
const r2 = {
  accountId: 'conta',
  bucket: 'idex',
  credentials: { accessKeyId: 'AK', secretAccessKey: 'SK', region: 'auto' },
}

function setup(over: Partial<SongStorageDeps> = {}) {
  const deleted: string[] = []
  const s3Calls: { method: string; url: string; body?: string }[] = []
  const deps: SongStorageDeps = {
    r2,
    getUserId: async (a) => (a ? 'u1' : null),
    canManageSong: async () => true,
    songChurch: async () => 'igreja-1',
    visibleFiles: async () => [
      { id: FILE, song_id: SONG, storage_path: `igreja-1/${SONG}/x.mp3`, storage_backend: 'r2' },
    ],
    deleteObject: async (key) => {
      deleted.push(key)
    },
    deleteRows: async () => undefined,
    uuid: () => 'abc',
    s3: async (p) => {
      s3Calls.push(p)
      if (p.url.endsWith('?uploads')) {
        return new Response(
          '<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>',
        )
      }
      return new Response('<CompleteMultipartUploadResult></CompleteMultipartUploadResult>')
    },
    ...over,
  }
  return { deps, deleted, s3Calls }
}

const post = async (deps: SongStorageDeps, body: unknown, auth = 'Bearer t') => {
  const res = await handleSongStorage(
    new Request('http://x', {
      method: 'POST',
      headers: { Authorization: auth },
      body: JSON.stringify(body),
    }),
    deps,
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('arquivos no R2', () => {
  it('sem R2 configurado o app continua no Supabase', async () => {
    const r = await post(setup({ r2: null }).deps, { action: 'config' })
    expect(r.body).toEqual({ r2: false, maxBytes: 100 * 1024 * 1024 })
    expect(
      (await post(setup({ r2: null }).deps, { action: 'download', fileIds: [FILE] })).status,
    ).toBe(503)
  })

  it('líder recebe link de envio na pasta da igreja/música; até 100 MB', async () => {
    const ok = await post(setup().deps, {
      action: 'upload',
      songId: SONG,
      fileName: 'Voz Tenor.MP3',
      contentType: 'audio/mpeg',
      size: 80 * 1024 * 1024,
    })
    expect(ok.status).toBe(200)
    expect(ok.body.key).toBe(`igreja-1/${SONG}/abc.mp3`)
    expect(String(ok.body.url)).toMatch(
      /^https:\/\/conta\.r2\.cloudflarestorage\.com\/idex\/igreja-1\/.*X-Amz-Signature=/,
    )
    const big = await post(setup().deps, {
      action: 'upload',
      songId: SONG,
      fileName: 'a.wav',
      contentType: 'audio/wav',
      size: 101 * 1024 * 1024,
    })
    expect(big.status).toBe(413)
  })

  it('integrante não envia nem apaga; ouve', async () => {
    const member = setup({ canManageSong: async () => false })
    const up = await post(member.deps, {
      action: 'upload',
      songId: SONG,
      fileName: 'a.mp3',
      contentType: 'audio/mpeg',
      size: 10,
    })
    expect(up.status).toBe(403)
    expect((await post(member.deps, { action: 'delete', fileIds: [FILE] })).status).toBe(403)
    expect(member.deleted).toHaveLength(0)
    const down = await post(member.deps, { action: 'download', fileIds: [FILE] })
    expect(Object.keys(down.body.urls as object)).toEqual([FILE])
  })

  it('sem login, nada', async () => {
    expect((await post(setup().deps, { action: 'config' }, '')).status).toBe(401)
  })
})

describe('envio em partes (arquivo grande)', () => {
  const MB = 1024 * 1024
  it('começa o envio e devolve um link por parte de 8 MB', async () => {
    const { deps, s3Calls } = setup()
    const r = await post(deps, {
      action: 'multipart_start',
      songId: SONG,
      fileName: 'PIANO.wav',
      contentType: 'audio/wav',
      size: 80 * MB,
    })
    expect(r.status).toBe(200)
    expect(r.body.key).toBe(`igreja-1/${SONG}/abc.wav`)
    expect(r.body.uploadId).toBe('up-1')
    const urls = r.body.urls as string[]
    expect(urls).toHaveLength(10)
    expect(urls[0]).toContain('partNumber=1')
    expect(urls[9]).toContain('partNumber=10')
    expect(urls[0]).toContain('uploadId=up-1')
    expect(s3Calls[0]).toMatchObject({ method: 'POST' })
  })

  it('junta as partes na ordem', async () => {
    const { deps, s3Calls } = setup()
    const r = await post(deps, {
      action: 'multipart_complete',
      songId: SONG,
      key: `igreja-1/${SONG}/abc.wav`,
      uploadId: 'up-1',
      parts: [
        { partNumber: 2, etag: '"b"' },
        { partNumber: 1, etag: '"a"' },
      ],
    })
    expect(r.status).toBe(200)
    expect(s3Calls[0]?.body).toBe(
      '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>&quot;a&quot;</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;b&quot;</ETag></Part></CompleteMultipartUpload>',
    )
  })

  it('não deixa mexer em arquivo de outra música ou sem ser líder', async () => {
    const other = await post(setup().deps, {
      action: 'multipart_abort',
      songId: SONG,
      key: 'outra-igreja/x/abc.wav',
      uploadId: 'up-1',
    })
    expect(other.status).toBe(400)
    const member = setup({ canManageSong: async () => false })
    const r = await post(member.deps, {
      action: 'multipart_start',
      songId: SONG,
      fileName: 'a.wav',
      contentType: 'audio/wav',
      size: 20 * MB,
    })
    expect(r.status).toBe(403)
  })

  it('erro do R2 ao juntar vira mensagem clara', async () => {
    const { deps } = setup({
      s3: async () => new Response('<Error><Code>InvalidPart</Code></Error>', { status: 400 }),
    })
    const r = await post(deps, {
      action: 'multipart_complete',
      songId: SONG,
      key: `igreja-1/${SONG}/abc.wav`,
      uploadId: 'up-1',
      parts: [{ partNumber: 1, etag: 'a' }],
    })
    expect(r.status).toBe(502)
  })
})
