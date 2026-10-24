// Como mostrar ao líder o que aconteceu com o aviso de cada pessoa.

export type Delivery = {
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
  push_sent_at: string | null
  has_whatsapp: boolean
  last_error: string | null
}

export type DeliveryTone = 'ok' | 'wait' | 'off' | 'error'

/** Texto curto e cor da situação de uma pessoa. */
export function deliveryLabel(
  d: Delivery,
  channel: string,
): { label: string; tone: DeliveryTone; detail?: string } {
  const whatsapp = channel === 'push_whatsapp' && d.has_whatsapp
  if (d.status === 'pending' || d.status === 'sending') {
    return { label: d.push_sent_at ? 'Celular ✓ · WhatsApp…' : 'Enviando…', tone: 'wait' }
  }
  if (d.status === 'sent') {
    if (d.push_sent_at && whatsapp) return { label: 'Celular e WhatsApp', tone: 'ok' }
    if (d.push_sent_at) return { label: 'Celular', tone: 'ok' }
    return { label: 'WhatsApp', tone: 'ok' }
  }
  if (d.status === 'skipped') {
    return {
      label: channel === 'push' ? 'Não ativou avisos no celular' : 'Sem celular nem WhatsApp',
      tone: 'off',
    }
  }
  return d.push_sent_at
    ? { label: 'Celular (WhatsApp falhou)', tone: 'ok', detail: d.last_error ?? undefined }
    : { label: 'Não chegou', tone: 'error', detail: d.last_error ?? undefined }
}

/** Resumo: quantos receberam de quantos. */
export function deliverySummary(list: Delivery[], channel: string) {
  const tones = list.map((d) => deliveryLabel(d, channel).tone)
  return {
    received: tones.filter((t) => t === 'ok').length,
    waiting: tones.filter((t) => t === 'wait').length,
    total: list.length,
  }
}

/** Por onde a pessoa vai receber (prévia antes de enviar). */
export function reachLabel(
  p: { has_push: boolean; has_whatsapp: boolean },
  channel: string,
): { label: string; reachable: boolean } {
  const whatsapp = channel === 'push_whatsapp' && p.has_whatsapp
  if (p.has_push && whatsapp) return { label: 'Celular e WhatsApp', reachable: true }
  if (p.has_push) return { label: 'Celular', reachable: true }
  if (whatsapp) return { label: 'WhatsApp', reachable: true }
  return {
    label: channel === 'push' ? 'Não ativou avisos no celular' : 'Sem celular nem WhatsApp',
    reachable: false,
  }
}
