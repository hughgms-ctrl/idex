import { describe, expect, it } from 'vitest'

import { handleReviewCheckinRequest, type ReviewDeps } from './handler.ts'

const REQ = '6f1c2a4e-1111-4111-8111-000000000001'
const START = '2026-10-24T22:30:00Z'
const SETTINGS = {
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
}

function setup(over: Partial<ReviewDeps> = {}, status = 'pending') {
  const applied: Record<string, unknown>[] = []
  const deps: ReviewDeps = {
    getUserId: async (a) => (a ? 'lider' : null),
    isLeaderOfMember: async () => true,
    loadRequest: async () => ({
      request: {
        id: REQ,
        status,
        ministry_member_id: 'mm1',
        declared_arrived_at: '2026-10-24T22:35:00Z',
      },
      event: { id: 'e', ministry_id: 'm', starts_at: START },
      settings: SETTINGS,
      justified: false,
    }),
    applyReview: async (args) => {
      applied.push(args)
      return null
    },
    ...over,
  }
  return { deps, applied }
}

const post = async (deps: ReviewDeps, body: unknown, auth = 'Bearer t') => {
  const res = await handleReviewCheckinRequest(
    new Request('http://x', {
      method: 'POST',
      headers: { Authorization: auth },
      body: JSON.stringify(body),
    }),
    deps,
  )
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('revisão do "esqueci de registrar"', () => {
  it('aprovar usa o horário declarado', async () => {
    const { deps, applied } = setup()
    const r = await post(deps, { requestId: REQ, decision: 'approve' })
    expect(r.status).toBe(200)
    expect(applied[0]).toMatchObject({
      status: 'approved',
      delta: 0,
      lateMinutes: 5,
      reviewerId: 'lider',
    })
  })

  it('ajustar muda o horário e recalcula o desconto', async () => {
    const { deps, applied } = setup()
    await post(deps, { requestId: REQ, decision: 'adjust', arrivedAt: '2026-10-24T22:45:00Z' })
    expect(applied[0]).toMatchObject({ status: 'adjusted', lateMinutes: 15, delta: -5 })
  })

  it('recusar vira falta', async () => {
    const { deps, applied } = setup()
    await post(deps, { requestId: REQ, decision: 'reject', note: 'Não estava' })
    expect(applied[0]).toMatchObject({
      status: 'rejected',
      delta: -20,
      arrivedAt: null,
      note: 'Não estava',
    })
  })

  it('só líder, só pendente, só logado', async () => {
    expect(
      (
        await post(setup({ isLeaderOfMember: async () => false }).deps, {
          requestId: REQ,
          decision: 'approve',
        })
      ).status,
    ).toBe(403)
    expect(
      (await post(setup({}, 'approved').deps, { requestId: REQ, decision: 'approve' })).status,
    ).toBe(409)
    expect((await post(setup().deps, { requestId: REQ, decision: 'approve' }, '')).status).toBe(401)
    expect((await post(setup().deps, { requestId: REQ, decision: 'adjust' })).status).toBe(400)
  })
})
