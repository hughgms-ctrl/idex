import { describe, expect, it } from 'vitest'

import { inviteMessage, inviteUrl, whatsappShareUrl } from '@/lib/invites'

describe('convites', () => {
  it('monta o link do convite', () => {
    expect(inviteUrl('abc123', 'https://idex.app')).toBe('https://idex.app/convite/abc123')
  })

  it('monta a mensagem e o link do WhatsApp', () => {
    const msg = inviteMessage('Igreja Esperança', 'Louvor', 'https://idex.app/convite/x')
    expect(msg).toContain('Louvor')
    expect(whatsappShareUrl(msg)).toMatch(/^https:\/\/wa\.me\/\?text=Voc%C3%AA/)
  })
})
