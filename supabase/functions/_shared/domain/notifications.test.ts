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

  it('aviso programado: ensaio da semana leva para confirmar', () => {
    const text = renderMessage('event_reminder', {
      name: 'Bruno Lima',
      kind: 'rehearsal',
      eventTitle: 'Ensaio',
      eventStartsAt: '2026-10-29T22:30:00Z',
      arriveAt: '2026-10-29T22:10:00Z',
      serviceTitle: 'Culto de domingo',
      serviceStartsAt: SUNDAY,
      path: '/confirmar/abc',
      appUrl: 'https://idex.app/',
    })
    expect(text).toBe(
      'Olá, Bruno! Lembrete: o ensaio *Ensaio* é quinta, 29/10 às 19h30. Chegada da equipe: *19h10*. É o ensaio do Culto de domingo de domingo, 01/11. Confirme sua presença pelo app ou avise se for se atrasar ou faltar.\n\nAbra o ide.x: https://idex.app/confirmar/abc',
    )
  })

  it('aviso programado: culto daqui a pouco, já confirmado', () => {
    const text = renderMessage('event_reminder', {
      kind: 'service',
      eventTitle: 'Culto de domingo',
      eventStartsAt: SUNDAY,
      role: 'Baixo',
      confirmed: true,
      soon: true,
    })
    expect(text).toBe(
      'Olá! Daqui a pouco: o *Culto de domingo* às 19h. Você está escalado(a) como *Baixo*. Presença confirmada ✅. Se algo mudar, avise pelo app.',
    )
    const push = renderPush(
      'event_reminder',
      {
        kind: 'service',
        eventTitle: 'Culto de domingo',
        eventStartsAt: SUNDAY,
        soon: true,
        path: '/confirmar/x',
      },
      't',
    )
    expect(push.title).toBe('Culto de domingo daqui a pouco')
    expect(push.url).toBe('/confirmar/x')
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

describe('ficou de fora pela regra de horário', () => {
  it('avisa a pessoa e o líder', () => {
    const base = { eventTitle: 'Ensaio', scope: 'event_and_service', memberName: 'Bruno Lima' }
    expect(renderMessage('member_benched', { ...base, self: true, name: 'Bruno' })).toContain(
      'você ficou de fora do ensaio e do culto',
    )
    expect(renderMessage('member_benched', { ...base, self: false, name: 'Ana' })).toContain(
      '*Bruno Lima* ficou de fora',
    )
    expect(renderPush('member_benched', { ...base, self: false }, 't').title).toBe(
      'Bruno Lima ficou de fora',
    )
  })
})

describe('ensaio remarcado', () => {
  it('avisa o novo horário, o antigo e a chegada', () => {
    const text = renderMessage('event_rescheduled', {
      name: 'Bruno',
      kind: 'rehearsal',
      eventTitle: 'Ensaio · Culto',
      eventStartsAt: '2026-10-30T23:00:00Z', // sexta 20h
      oldStartsAt: '2026-10-29T23:00:00Z', // quinta 20h
      arriveAt: '2026-10-30T22:40:00Z',
    })
    expect(text).toContain('O ensaio *Ensaio · Culto* foi remarcado para *sexta, 30/10 às 20h*')
    expect(text).toContain('(era quinta, 29/10 às 20h)')
    expect(text).toContain('Chegada da equipe: *19h40*')
    expect(renderPush('event_rescheduled', { kind: 'rehearsal' }, 't').title).toBe(
      'Ensaio remarcado',
    )
  })
})

describe('aviso da central', () => {
  it('manda o título e o texto escritos pelo líder', () => {
    const text = renderMessage('announcement', {
      name: 'Luiz Manoel',
      title: 'Ensaio extra',
      body: 'Sábado às 15h, tragam as cifras.',
      appUrl: 'https://idex.app/',
      path: '/',
    })
    expect(text).toBe(
      'Olá, Luiz! *Ensaio extra*\n\nSábado às 15h, tragam as cifras.\n\nAbra o ide.x: https://idex.app/',
    )
    expect(
      renderPush(
        'announcement',
        { title: 'Ensaio extra', body: 'Sábado às 15h', path: '/confirmar/e1' },
        't',
      ),
    ).toEqual({ title: 'Ensaio extra', body: 'Sábado às 15h', url: '/confirmar/e1', tag: 't' })
  })
})
