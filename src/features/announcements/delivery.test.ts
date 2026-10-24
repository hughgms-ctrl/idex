import { describe, expect, it } from 'vitest'

import { deliveryLabel, deliverySummary, reachLabel, type Delivery } from './delivery'

const base: Delivery = { status: 'sent', push_sent_at: null, has_whatsapp: false, last_error: null }

describe('quem recebeu o aviso', () => {
  it('mostra por onde chegou', () => {
    expect(deliveryLabel({ ...base, push_sent_at: 'x' }, 'push').label).toBe('Celular')
    expect(
      deliveryLabel({ ...base, push_sent_at: 'x', has_whatsapp: true }, 'push_whatsapp').label,
    ).toBe('Celular e WhatsApp')
    expect(deliveryLabel({ ...base, has_whatsapp: true }, 'push_whatsapp').label).toBe('WhatsApp')
  })

  it('explica quem ficou de fora', () => {
    expect(deliveryLabel({ ...base, status: 'skipped' }, 'push')).toEqual({
      label: 'Não ativou avisos no celular',
      tone: 'off',
    })
    expect(
      deliveryLabel(
        { ...base, status: 'failed', last_error: 'Telefone inválido' },
        'push_whatsapp',
      ),
    ).toEqual({ label: 'Não chegou', tone: 'error', detail: 'Telefone inválido' })
  })

  it('celular entregue e WhatsApp com falha conta como recebido', () => {
    const d: Delivery = { ...base, status: 'failed', push_sent_at: 'x', last_error: 'erro' }
    expect(deliveryLabel(d, 'push_whatsapp').tone).toBe('ok')
    expect(
      deliverySummary([d, { ...base, status: 'skipped' }, { ...base, status: 'sending' }], 'push'),
    ).toEqual({ received: 1, waiting: 1, total: 3 })
  })

  it('prévia: só celular deixa de fora quem não ativou', () => {
    expect(reachLabel({ has_push: false, has_whatsapp: true }, 'push').reachable).toBe(false)
    expect(reachLabel({ has_push: false, has_whatsapp: true }, 'push_whatsapp').label).toBe(
      'WhatsApp',
    )
  })
})
