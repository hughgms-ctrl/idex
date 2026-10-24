import { describe, expect, it } from 'vitest'

import type { EventContext } from '../_shared/deps.ts'
import { qrPayload } from '../_shared/domain/qr.ts'
import { handleCheckin, type CheckinDeps } from './handler.ts'

const SECRET = 'segredo'
const EVENT = '0b6f6f8e-3c1a-4d2a-9f4b-1a2b3c4d5e6f'
const START = Date.parse('2026-10-24T22:30:00Z')
const IGREJA = { lat: -23.55052, lng: -46.633308 }

function context(over: Partial<EventContext> = {}): EventContext {
  return {
    event: {
      id: EVENT,
      church_id: 'c',
      ministry_id: 'm',
      kind: 'service',
      service_event_id: null,
      starts_at: new Date(START).toISOString(),
      arrive_at: null,
      ends_at: null,
      lat: null,
      lng: null,
      radius_m: null,
    },
    church: { ...IGREJA, checkin_radius_m: 300 },
    settings: {
      late_tolerance_min: 10,
      late_penalty_tiers: [
        { upToMin: 20, points: 5 },
        { upToMin: null, points: 10 },
      ],
      absence_penalty: 20,
      cycle_starting_points: 100,
      cycle_min_points: 70,
      checkin_request_limit_per_cycle: 3,
      checkin_request_deadline_hours: 48,
      checkin_radius_m: null,
    },
    member: { id: 'mm1', status: 'active' },
    assigned: true,
    benched: false,
    alreadyCheckedIn: false,
    justified: false,
    ...over,
  }
}

const CODE = 'a1b2c3d4e5f60718293a4b5c'

function setup(now: number, ctx: EventContext | null = context()) {
  const recorded: unknown[] = []
  const attempts: string[] = []
  const consequences: unknown[] = []
  const deps: CheckinDeps = {
    getUserId: async (auth) => (auth ? 'u1' : null),
    loadEventContext: async () => ctx,
    recordAttendance: async (args) => {
      recorded.push(args)
      return 'checkin-id'
    },
    logAttempt: async (a) => {
      attempts.push(a.outcome)
    },
    balanceFor: async () => 95,
    applyConsequence: async (args) => {
      consequences.push(args)
      return 1
    },
    resolveCheckinCode: async (code) =>
      code === CODE ? { status: 'ok', eventId: EVENT } : { status: 'invalid' },
    qrSecret: SECRET,
    now: () => now,
  }
  return { deps, recorded, attempts, consequences }
}

async function post(deps: CheckinDeps, body: Record<string, unknown>, auth = 'Bearer t') {
  const res = await handleCheckin(
    new Request('http://x/checkin', {
      method: 'POST',
      headers: { Authorization: auth },
      body: JSON.stringify(body),
    }),
    deps,
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('checkin', () => {
  it('registra no horário dentro do raio', async () => {
    const now = START + 5 * 60_000
    const { deps, recorded, attempts } = setup(now)
    const qr = await qrPayload(SECRET, EVENT, now)
    const r = await post(deps, { qr, lat: IGREJA.lat + 0.001, lng: IGREJA.lng, accuracy: 15 })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      kind: 'on_time',
      lateMinutes: 5,
      delta: 0,
      balance: 95,
      distanceM: 111,
    })
    expect(recorded).toHaveLength(1)
    expect(attempts).toEqual(['ok'])
  })

  it('atrasado perde pontos pela faixa', async () => {
    const now = START + 25 * 60_000
    const { deps, recorded } = setup(now)
    const r = await post(deps, { qr: await qrPayload(SECRET, EVENT, now), ...IGREJA, accuracy: 5 })
    expect(r.body).toMatchObject({ kind: 'late', lateMinutes: 25, delta: -10 })
    expect(recorded[0]).toMatchObject({ delta: -10, lateMinutes: 25 })
  })

  it('justificativa aprovada não desconta', async () => {
    const now = START + 25 * 60_000
    const { deps } = setup(now, context({ justified: true }))
    const r = await post(deps, { qr: await qrPayload(SECRET, EVENT, now), ...IGREJA })
    expect(r.body).toMatchObject({ kind: 'justified', delta: 0 })
  })

  it('QR de mais de 1 minuto atrás é recusado e fica como evidência', async () => {
    const now = START
    const { deps, recorded, attempts } = setup(now)
    const old = await qrPayload(SECRET, EVENT, now - 70_000)
    const r = await post(deps, { qr: old, ...IGREJA })
    expect(r.status).toBe(400)
    expect(recorded).toHaveLength(0)
    expect(attempts).toEqual(['invalid_qr'])
  })

  it('fora do raio é recusado com a distância', async () => {
    const { deps, attempts } = setup(START)
    const r = await post(deps, {
      qr: await qrPayload(SECRET, EVENT, START),
      lat: IGREJA.lat + 0.01,
      lng: IGREJA.lng,
      accuracy: 20,
    })
    expect(r.status).toBe(403)
    expect(String(r.body.error)).toMatch(/1112 m/)
    expect(attempts).toEqual(['outside_radius'])
  })

  it('exige login, escala, horário e localização da igreja', async () => {
    const qr = await qrPayload(SECRET, EVENT, START)
    expect((await post(setup(START).deps, { qr, ...IGREJA }, '')).status).toBe(401)
    expect(
      (await post(setup(START, context({ assigned: false })).deps, { qr, ...IGREJA })).status,
    ).toBe(403)
    expect(
      (await post(setup(START, context({ alreadyCheckedIn: true })).deps, { qr, ...IGREJA }))
        .status,
    ).toBe(409)
    const early = START - 3 * 3_600_000
    expect(
      (await post(setup(early).deps, { qr: await qrPayload(SECRET, EVENT, early), ...IGREJA }))
        .status,
    ).toBe(409)
    const noPlace = context({ church: { lat: null, lng: null, checkin_radius_m: 300 } })
    expect((await post(setup(START, noPlace).deps, { qr, ...IGREJA })).status).toBe(409)
    expect((await post(setup(START).deps, { qr: 'não é qr', ...IGREJA })).status).toBe(400)
    expect((await post(setup(START).deps, { qr })).status).toBe(400) // sem localização
  })

  describe('forma do ponto escolhida pelo líder', () => {
    const withMode = (checkin_mode: string) =>
      context({ settings: { ...context().settings, checkin_mode } })

    it('só localização: bate o ponto sem QR, pelo evento', async () => {
      const { deps, recorded } = setup(START, withMode('geo'))
      const r = await post(deps, { eventId: EVENT, ...IGREJA, accuracy: 10 })
      expect(r.status).toBe(200)
      expect(recorded[0]).toMatchObject({ source: 'geo' })
      // longe da igreja continua recusado
      const far = await post(setup(START, withMode('geo')).deps, {
        eventId: EVENT,
        lat: IGREJA.lat + 0.05,
        lng: IGREJA.lng,
      })
      expect(far.status).toBe(403)
      // sem localização não dá
      expect((await post(setup(START, withMode('geo')).deps, { eventId: EVENT })).status).toBe(400)
    })

    it('só QR: não exige localização', async () => {
      const { deps, recorded } = setup(START, withMode('qr'))
      const r = await post(deps, { qr: await qrPayload(SECRET, EVENT, START) })
      expect(r.status).toBe(200)
      expect(recorded[0]).toMatchObject({ source: 'qr', lat: null, distanceM: null })
      // sem QR não dá
      const noQr = await post(setup(START, withMode('qr')).deps, { eventId: EVENT, ...IGREJA })
      expect(noQr.status).toBe(400)
    })

    it('QR + localização (padrão) exige os dois', async () => {
      const noQr = await post(setup(START).deps, { eventId: EVENT, ...IGREJA })
      expect(noQr.status).toBe(400)
    })

    it('aceita o QR lido pela câmera do celular (endereço do app)', async () => {
      const { deps } = setup(START)
      const payload = await qrPayload(SECRET, EVENT, START)
      const r = await post(deps, {
        qr: `https://idex.app/ponto?q=${encodeURIComponent(payload)}`,
        ...IGREJA,
      })
      expect(r.status).toBe(200)
    })
  })

  it('atraso conta a partir do horário de chegada definido pelo líder', async () => {
    const withArrival = context()
    withArrival.event.arrive_at = new Date(START - 30 * 60_000).toISOString() // chegar 30 min antes
    // chega no horário do culto = 30 min atrasado em relação à chegada
    const { deps } = setup(START, withArrival)
    const r = await post(deps, { qr: await qrPayload(SECRET, EVENT, START), ...IGREJA })
    expect(r.body).toMatchObject({ kind: 'late', lateMinutes: 30, delta: -10 })
    // e o ponto abre 2h antes da chegada (2h30 antes do culto)
    const early = START - 150 * 60_000 + 60_000
    const ok = await post(setup(early, withArrival).deps, {
      qr: await qrPayload(SECRET, EVENT, early),
      ...IGREJA,
    })
    expect(ok.status).toBe(200)
  })

  describe('QR fixo e regras de atraso', () => {
    it('QR fixo (endereço impresso) leva ao evento com ponto aberto', async () => {
      const { deps, recorded } = setup(START)
      const r = await post(deps, { qr: `https://idex.app/ponto?c=${CODE}`, ...IGREJA })
      expect(r.status).toBe(200)
      expect(recorded[0]).toMatchObject({ eventId: EVENT, source: 'qr' })
      const old = await post(setup(START).deps, { code: 'f'.repeat(24), ...IGREJA })
      expect(old.status).toBe(400)
    })

    it('atraso no ensaio com a regra "fora do ensaio e do culto"', async () => {
      const ensaio = context({
        settings: {
          ...context().settings,
          rehearsal_tolerance_min: 10,
          rehearsal_late_consequence: 'out_rehearsal_and_service',
        },
      })
      ensaio.event.kind = 'rehearsal'
      ensaio.event.service_event_id = 'culto-1'
      const now = START + 15 * 60_000
      const { deps, consequences } = setup(now, ensaio)
      const r = await post(deps, { code: CODE, ...IGREJA })
      expect(r.status).toBe(200)
      expect(r.body.consequence).toMatchObject({ scope: 'event_and_service' })
      expect(consequences[0]).toMatchObject({ scope: 'event_and_service', memberId: 'mm1' })
      // dentro da tolerância: nada acontece
      const ok = setup(START + 5 * 60_000, ensaio)
      await post(ok.deps, { code: CODE, ...IGREJA })
      expect(ok.consequences).toHaveLength(0)
    })

    it('quem ficou de fora não bate ponto no culto', async () => {
      const r = await post(setup(START, context({ benched: true })).deps, { code: CODE, ...IGREJA })
      expect(r.status).toBe(403)
    })
  })
})
