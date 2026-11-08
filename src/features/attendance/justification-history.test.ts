import { describe, expect, it } from 'vitest'

import {
  groupHistory,
  historySentence,
  kindForLedgerReason,
  openDiscount,
  stepLabel,
  type HistoryEvent,
  type HistoryRow,
} from './justification-history'

describe('historySentence', () => {
  it('membro enviando o próprio aviso', () => {
    expect(
      historySentence({ action: 'created', kind: 'absence', actor: 'Luiz', member: 'Luiz' }),
    ).toEqual({ text: 'Luiz enviou aviso de falta', tone: 'info' })
  })

  it('líder registrando por outra pessoa', () => {
    expect(
      historySentence({
        action: 'created_by_leader',
        kind: 'absence',
        actor: 'Hugo',
        member: 'Thayna',
      }).text,
    ).toBe('Hugo registrou aviso de falta por Thayna')
  })

  it('aprovação e recusa', () => {
    expect(
      historySentence({ action: 'approved', kind: 'late', actor: 'Hugo', member: 'Pablo' }),
    ).toEqual({ text: 'Hugo aprovou o aviso de atraso de Pablo', tone: 'ok' })
    expect(
      historySentence({ action: 'rejected', kind: 'late', actor: 'Hugo', member: 'Pablo' }).tone,
    ).toBe('bad')
  })

  it('sem quem fez (perfil apagado)', () => {
    expect(
      historySentence({ action: 'approved', kind: 'absence', actor: null, member: 'Ana' }).text,
    ).toBe('Alguém aprovou o aviso de falta de Ana')
  })
})

describe('openDiscount', () => {
  it('desconto sem aviso', () => {
    expect(openDiscount([{ delta: -20, reason: 'absence', note: 'Falta sem aviso' }])).toBe(20)
  })

  it('desconto já devolvido por aviso aprovado', () => {
    expect(
      openDiscount([
        { delta: -20, reason: 'absence', note: 'Falta sem aviso' },
        { delta: 20, reason: 'adjustment', note: 'Aviso aprovado: falta sem desconto' },
      ]),
    ).toBe(0)
  })

  it('ignora outros lançamentos', () => {
    expect(
      openDiscount([
        { delta: -5, reason: 'late', note: null },
        { delta: 5, reason: 'recovery', note: null },
      ]),
    ).toBe(5)
  })

  it('tipo pelo motivo do desconto', () => {
    expect(kindForLedgerReason('late')).toBe('late')
    expect(kindForLedgerReason('absence')).toBe('absence')
  })
})

describe('groupHistory', () => {
  const culto: HistoryEvent = {
    id: 'c',
    title: 'Culto',
    starts_at: '2026-11-08T12:30:00Z',
    arrive_at: '2026-11-08T11:10:00Z',
    service_event_id: null,
  }
  const ensaio: HistoryEvent = {
    id: 'e',
    title: 'Ensaio de vozes',
    starts_at: '2026-11-08T11:30:00Z',
    arrive_at: '2026-11-08T11:10:00Z',
    service_event_id: 'c',
  }
  const outro = { ...culto, id: 'x', starts_at: '2026-11-15T12:30:00Z', arrive_at: null }
  const row = (
    id: string,
    just: string,
    action: string,
    at: string,
    event = culto,
    extra: Partial<HistoryRow> = {},
  ): HistoryRow => ({
    id,
    justification_id: just,
    action,
    kind: 'absence',
    reason: 'Chuva',
    note: null,
    at,
    member_id: 'm',
    member: 'Ana',
    actor: action === 'created' ? 'Ana' : 'Hugo',
    event,
    ...extra,
  })

  it('envio e aprovação do mesmo aviso viram um cartão', () => {
    const cards = groupHistory([
      row('1', 'j1', 'created', '2026-11-08T10:00:00Z'),
      row('2', 'j1', 'approved', '2026-11-08T10:30:00Z'),
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0]!.status).toBe('approved')
    expect(cards[0]!.steps.map((s) => stepLabel(s, 'Ana'))).toEqual([
      'Enviado',
      'Aprovado por Hugo',
    ])
  })

  it('registrado pelo líder no mesmo instante: registro antes da aprovação', () => {
    const cards = groupHistory([
      row('2', 'j1', 'approved', '2026-11-08T10:00:00Z'),
      row('1', 'j1', 'created_by_leader', '2026-11-08T10:00:00Z', culto, { actor: 'Hugo' }),
    ])
    expect(cards[0]!.byLeader).toBe(true)
    expect(cards[0]!.steps.map((s) => s.action)).toEqual(['created_by_leader', 'approved'])
  })

  it('aviso igual no culto e no ensaio junto vira um cartão só', () => {
    const cards = groupHistory([
      row('1', 'j1', 'created', '2026-11-08T10:00:00Z', culto),
      row('2', 'j2', 'created', '2026-11-08T10:01:00Z', ensaio),
      row('3', 'j1', 'approved', '2026-11-08T10:30:00Z', culto),
      row('4', 'j2', 'approved', '2026-11-08T10:30:20Z', ensaio),
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0]!.events.map((e) => e.id)).toEqual(['e', 'c'])
    expect(cards[0]!.steps.map((s) => s.action)).toEqual(['created', 'approved'])
  })

  it('não junta outro culto, outra pessoa nem motivo diferente', () => {
    expect(
      groupHistory([
        row('1', 'j1', 'created', '2026-11-08T10:00:00Z', culto),
        row('2', 'j2', 'created', '2026-11-08T10:00:00Z', outro),
        row('3', 'j3', 'created', '2026-11-08T10:00:00Z', ensaio, {
          member_id: 'n',
          member: 'Bia',
        }),
        row('4', 'j4', 'created', '2026-11-08T10:00:00Z', ensaio, { reason: 'Outro' }),
      ]),
    ).toHaveLength(4)
  })

  it('cancelado e recusado', () => {
    expect(
      groupHistory([
        row('1', 'j1', 'created', '2026-11-08T10:00:00Z'),
        row('2', 'j1', 'cancelled', '2026-11-08T11:00:00Z', culto, { actor: 'Ana' }),
      ])[0]!.status,
    ).toBe('cancelled')
    expect(
      groupHistory([
        row('1', 'j1', 'created', '2026-11-08T10:00:00Z'),
        row('2', 'j1', 'rejected', '2026-11-08T11:00:00Z'),
      ])[0]!.status,
    ).toBe('rejected')
  })
})
