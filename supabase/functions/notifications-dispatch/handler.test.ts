import { describe, expect, it } from 'vitest'

import { makeEvolutionSender } from '../_shared/evolution.ts'
import { handleDispatch, type DispatchDeps, type QueueItem } from './handler.ts'

const NOW = Date.parse('2026-10-30T12:00:00Z')

function setup(items: QueueItem[], send: DispatchDeps['send'], push: Partial<DispatchDeps> = {}) {
  const finished: { id: string; ok: boolean; error: string | null; retryAt: string | null }[] = []
  const pushSent: string[] = []
  const removed: string[] = []
  const deps: DispatchDeps = {
    serviceKey: 'service',
    whatsappConfigured: true,
    pushConfigured: false,
    appUrl: 'https://idex.app',
    claim: async () => items,
    finish: async (id, ok, error, retryAt) => {
      finished.push({ id, ok, error, retryAt })
    },
    send,
    pushSubscriptions: async () => [],
    sendPush: async () => ({ ok: true }),
    removeSubscription: async (endpoint) => {
      removed.push(endpoint)
    },
    markPushSent: async (id) => {
      pushSent.push(id)
    },
    now: () => NOW,
    ...push,
  }
  return { deps, finished, pushSent, removed }
}

const SUB = { endpoint: 'https://push.example/1', p256dh: 'x', auth: 'y' }

const call = (deps: DispatchDeps, token = 'service') =>
  handleDispatch(
    new Request('http://x', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
    deps,
  )

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: 'n1',
  kind: 'schedule_reminder',
  payload: {
    name: 'Bruno',
    eventTitle: 'Culto',
    eventStartsAt: '2026-11-01T22:00:00Z',
    role: 'Violão',
  },
  attempts: 1,
  profile_id: 'p1',
  phone: '(11) 91234-5678',
  push_sent: false,
  ...over,
})

describe('envio de avisos', () => {
  it('só roda com a chave do servidor', async () => {
    const { deps } = setup([], async () => ({ ok: true }))
    expect((await call(deps, 'anon')).status).toBe(401)
    expect((await call({ ...deps, whatsappConfigured: false })).status).toBe(503)
  })

  it('envia com telefone normalizado e texto em pt-BR', async () => {
    const sent: { phone: string; text: string }[] = []
    const { deps, finished } = setup([item()], async (phone, text) => {
      sent.push({ phone, text })
      return { ok: true }
    })
    const res = await call(deps)
    expect(await res.json()).toEqual({ processed: 1, sent: 1, retried: 0, failed: 0 })
    expect(sent[0]?.phone).toBe('5511912345678')
    expect(sent[0]?.text).toContain('escalado(a) como *Violão*')
    expect(sent[0]?.text).toContain('https://idex.app')
    expect(finished[0]).toMatchObject({ ok: true })
  })

  it('falha agenda nova tentativa; depois da 5ª desiste', async () => {
    const { deps, finished } = setup(
      [item({ attempts: 2 }), item({ id: 'n2', attempts: 6 })],
      async () => ({ ok: false, error: 'HTTP 500' }),
    )
    expect(await (await call(deps)).json()).toEqual({
      processed: 2,
      sent: 0,
      retried: 1,
      failed: 1,
    })
    expect(finished[0]).toEqual({
      id: 'n1',
      ok: false,
      error: 'HTTP 500',
      retryAt: new Date(NOW + 5 * 60_000).toISOString(),
    })
    expect(finished[1]).toEqual({ id: 'n2', ok: false, error: 'HTTP 500', retryAt: null })
  })

  it('telefone inválido não tenta enviar', async () => {
    let called = false
    const { deps, finished } = setup([item({ phone: '123' })], async () => {
      called = true
      return { ok: true }
    })
    await call(deps)
    expect(called).toBe(false)
    expect(finished[0]).toMatchObject({ ok: false, error: 'Telefone inválido' })
  })

  it('cliente Evolution: endpoint, chave e corpo', async () => {
    let req: { url: string; init?: RequestInit } | null = null
    const send = makeEvolutionSender(
      { url: 'https://evo.exemplo.com/', apiKey: 'k', instance: 'Igreja 1' },
      (async (url: string, init?: RequestInit) => {
        req = { url, init }
        return new Response('{}', { status: 201 })
      }) as typeof fetch,
    )
    expect(await send('5511912345678', 'oi')).toEqual({ ok: true })
    expect(req!.url).toBe('https://evo.exemplo.com/message/sendText/Igreja%201')
    expect((req!.init?.headers as Record<string, string>).apikey).toBe('k')
    expect(JSON.parse(String(req!.init?.body))).toEqual({ number: '5511912345678', text: 'oi' })
    const failing = makeEvolutionSender(
      { url: 'x', apiKey: 'k', instance: 'i' },
      (async () => new Response('erro', { status: 401 })) as typeof fetch,
    )
    expect(await failing('1', 'a')).toEqual({ ok: false, error: 'HTTP 401 erro' })
  })

  describe('aviso no celular', () => {
    it('sem WhatsApp configurado, entrega só no celular', async () => {
      const messages: unknown[] = []
      const { deps, finished, pushSent } = setup([item()], async () => ({ ok: true }), {
        whatsappConfigured: false,
        pushConfigured: true,
        pushSubscriptions: async () => [SUB],
        sendPush: async (_sub, message) => {
          messages.push(message)
          return { ok: true }
        },
      })
      expect(await (await call(deps)).json()).toMatchObject({ sent: 1 })
      expect(messages[0]).toMatchObject({ title: 'Você está na escala', url: '/escalas' })
      expect(pushSent).toEqual(['n1'])
      expect(finished[0]).toMatchObject({ ok: true })
    })

    it('manda nos dois canais; na nova tentativa do WhatsApp não repete o celular', async () => {
      let pushes = 0
      const { deps, finished } = setup(
        [item({ push_sent: true })],
        async () => ({ ok: false, error: 'HTTP 500' }),
        {
          pushConfigured: true,
          pushSubscriptions: async () => [SUB],
          sendPush: async () => {
            pushes++
            return { ok: true }
          },
        },
      )
      await call(deps)
      expect(pushes).toBe(0)
      expect(finished[0]).toMatchObject({ ok: false, error: 'HTTP 500' })
    })

    it('apaga aparelho que não existe mais; sem canal, não insiste', async () => {
      const { deps, finished, removed } = setup(
        [item({ phone: null })],
        async () => ({ ok: true }),
        {
          pushConfigured: true,
          pushSubscriptions: async () => [SUB],
          sendPush: async () => ({ ok: false, gone: true, error: 'HTTP 410' }),
        },
      )
      await call(deps)
      expect(removed).toEqual([SUB.endpoint])
      expect(finished[0]).toMatchObject({ ok: false, retryAt: null })
    })

    it('falha passageira no celular tenta de novo', async () => {
      const { deps, finished } = setup([item({ phone: null })], async () => ({ ok: true }), {
        pushConfigured: true,
        pushSubscriptions: async () => [SUB],
        sendPush: async () => ({ ok: false, gone: false, error: 'HTTP 503' }),
      })
      await call(deps)
      expect(finished[0]?.retryAt).not.toBeNull()
    })
  })
})
