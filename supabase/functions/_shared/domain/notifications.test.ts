import { describe, expect, it } from 'vitest'

import { normalizePhone, renderMessage, renderPush, retryDelayMs } from './notifications.ts'

const SUNDAY = '2026-11-01T22:00:00Z' // domingo 19h em SP

describe('mensagens', () => {
  it('lembrete de escala D-2', () => {
    expect(
      renderMessage('schedule_reminder', {
        name: 'Bruno Lima',
        eventTitle: 'Culto de domingo',
        eventStartsAt: SUNDAY,
        role: 'Violão',
      }),
    ).toBe(
      'Olá, Bruno! Lembrete: você está escalado(a) como *Violão* no *Culto de domingo* de domingo, 01/11 às 19h. Se não puder ir, avise o líder pelo app o quanto antes.',
    )
  })

  it('ensaio hoje', () => {
    expect(
      renderMessage('rehearsal_today', {
        name: 'Carla',
        eventTitle: 'Ensaio',
        eventStartsAt: '2026-10-29T23:30:00Z',
      }),
    ).toContain('Hoje tem *Ensaio* às 20h30')
  })

  it('ponto descontado com saldo', () => {
    expect(
      renderMessage('points_deducted', {
        name: 'Ana',
        delta: -10,
        reason: 'late',
        eventTitle: 'Ensaio',
        eventStartsAt: SUNDAY,
        balance: 90,
      }),
    ).toBe(
      'Olá, Ana! Foram descontados *10 pontos* por atraso (Ensaio, domingo, 01/11). Seu saldo no ciclo: *90*.',
    )
  })

  it('pedido aprovado/recusado e justificativa, com link do app', () => {
    expect(
      renderMessage('request_reviewed', { name: 'Hugo', status: 'approved', eventTitle: 'Ensaio' }),
    ).toContain('foi *aprovado*')
    expect(
      renderMessage('request_reviewed', {
        name: 'Hugo',
        status: 'rejected',
        kind: 'justificativa',
        appUrl: 'https://idex.app',
      }),
    ).toBe('Olá, Hugo! Seu aviso de falta/atraso foi *recusado*.\n\nAbra o ide.x: https://idex.app')
  })
})

describe('telefone e novas tentativas', () => {
  it('normaliza números brasileiros', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('5511912345678')
    expect(normalizePhone('+55 11 91234-5678')).toBe('5511912345678')
    expect(normalizePhone('1234')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })

  it('espera cada vez mais e desiste depois de 5 tentativas', () => {
    expect(retryDelayMs(1)).toBe(60_000)
    expect(retryDelayMs(5)).toBe(6 * 3_600_000)
    expect(retryDelayMs(6)).toBeNull()
  })
})

describe('aviso no celular', () => {
  it('título curto, texto sem asteriscos e a tela certa', () => {
    const push = renderPush(
      'schedule_reminder',
      { name: 'Bruno Lima', eventTitle: 'Culto de domingo', eventStartsAt: SUNDAY, role: 'Violão' },
      'n1',
    )
    expect(push.title).toBe('Você está na escala')
    expect(push.body).not.toContain('*')
    expect(push.body).not.toMatch(/^Olá/)
    expect(push.body).toContain('Violão')
    expect(push.url).toBe('/escalas')
  })
})

describe('horário de chegada', () => {
  it('lembrete e ensaio do dia avisam a chegada da equipe', () => {
    const arriveAt = '2026-11-01T21:30:00Z' // 18h30 em SP
    expect(
      renderMessage('schedule_reminder', { eventTitle: 'Culto', eventStartsAt: SUNDAY, arriveAt }),
    ).toContain('Chegada da equipe: *18h30*')
    expect(
      renderMessage('rehearsal_today', { eventTitle: 'Ensaio', eventStartsAt: SUNDAY, arriveAt }),
    ).toContain('Chegada da equipe: *18h30*')
  })
})
