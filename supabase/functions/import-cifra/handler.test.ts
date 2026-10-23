import { describe, expect, it } from 'vitest'

import { handleImportCifra, type Deps } from './handler.ts'

const MINISTRY = '6f1c2a4e-1111-4111-8111-000000000001'
const PAGE = `<h1 class="t1">Canção</h1><h2 class="t3"><a>Banda</a></h2>
<span id="cifra_tom">tom: <a>D</a></span><pre><b>D</b>     <b>A</b>
Letra de teste</pre>`

function withUrl(res: Response, url: string): Response {
  Object.defineProperty(res, 'url', { value: url })
  return res
}

function deps(over: Partial<Deps> = {}): Deps {
  return {
    getUserId: async (auth) => (auth ? 'user-1' : null),
    isLeader: async () => true,
    fetch: (async (input: string | URL | Request) =>
      withUrl(new Response(PAGE, { status: 200 }), String(input))) as typeof fetch,
    ...over,
  }
}

function post(body: unknown, auth = 'Bearer x') {
  return new Request('http://localhost/import-cifra', {
    method: 'POST',
    headers: { Authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('import-cifra', () => {
  it('exige login', async () => {
    const res = await handleImportCifra(post({ ministryId: MINISTRY, url: 'x' }, ''), deps())
    expect(res.status).toBe(401)
  })

  it('só o líder importa', async () => {
    const res = await handleImportCifra(
      post({ ministryId: MINISTRY, artist: 'A', title: 'B' }),
      deps({ isLeader: async () => false }),
    )
    expect(res.status).toBe(403)
  })

  it('recusa links fora do Cifra Club', async () => {
    const res = await handleImportCifra(
      post({ ministryId: MINISTRY, url: 'https://evil.com/x' }),
      deps(),
    )
    expect(res.status).toBe(400)
  })

  it('valida os dados', async () => {
    const res = await handleImportCifra(post({ ministryId: 'x' }), deps())
    expect(res.status).toBe(400)
  })

  it('busca por artista e música e devolve a cifra', async () => {
    let requested = ''
    const res = await handleImportCifra(
      post({ ministryId: MINISTRY, artist: 'Banda', title: 'Canção' }),
      deps({
        fetch: (async (input: string | URL | Request) => {
          requested = String(input)
          return withUrl(new Response(PAGE), requested)
        }) as typeof fetch,
      }),
    )
    expect(res.status).toBe(200)
    expect(requested).toBe('https://www.cifraclub.com.br/banda/cancao/')
    const body = (await res.json()) as { title: string; key: string; text: string }
    expect(body).toMatchObject({ title: 'Canção', key: 'D' })
    expect(body.text).toContain('Letra de teste')
  })

  it('música inexistente e site fora do ar viram mensagens claras', async () => {
    const notFound = await handleImportCifra(
      post({ ministryId: MINISTRY, artist: 'A', title: 'B' }),
      deps({ fetch: (async () => new Response('', { status: 404 })) as typeof fetch }),
    )
    expect(notFound.status).toBe(404)
    const down = await handleImportCifra(
      post({ ministryId: MINISTRY, artist: 'A', title: 'B' }),
      deps({
        fetch: (async () => {
          throw new Error('rede')
        }) as typeof fetch,
      }),
    )
    expect(down.status).toBe(502)
    const blocked = await handleImportCifra(
      post({ ministryId: MINISTRY, artist: 'A', title: 'B' }),
      deps({ fetch: (async () => new Response('Access Denied', { status: 403 })) as typeof fetch }),
    )
    expect(blocked.status).toBe(502)
    expect(((await blocked.json()) as { error: string }).error).toContain('Abrir no Cifra Club')
  })

  it('não segue redirecionamento para outro site', async () => {
    const res = await handleImportCifra(
      post({ ministryId: MINISTRY, url: 'https://www.cifraclub.com.br/a/b/' }),
      deps({
        fetch: (async () => withUrl(new Response(PAGE), 'https://outro.com/')) as typeof fetch,
      }),
    )
    expect(res.status).toBe(400)
  })
})
