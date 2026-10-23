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
      starts_at: new Date(START).toISOString(),
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
    alreadyCheckedIn: false,
    justified: false,
    ...over,
  }
}

function setup(now: number, ctx: EventContext | null = context()) {
  const recorded: unknown[] = []
  const attempts: string[] = []
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
    qrSecret: SECRET,
    now: () => now,
  }
  return { deps, recorded, attempts }
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
})
