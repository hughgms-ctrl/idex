import { describe, expect, it } from 'vitest'

import { historySentence, kindForLedgerReason, openDiscount } from './justification-history'

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
