import { describe, expect, it } from 'vitest'

import { churchSchema, inviteSchema, signUpSchema } from '@/lib/schemas'

describe('schemas', () => {
  it('normaliza e-mail e exige senha de 6+', () => {
    const ok = signUpSchema.safeParse({
      fullName: 'Ana',
      email: ' ANA@Teste.com ',
      password: '123456',
    })
    expect(ok.success && ok.data.email).toBe('ana@teste.com')
    expect(
      signUpSchema.safeParse({ fullName: 'Ana', email: 'a@b.co', password: '123' }).success,
    ).toBe(false)
  })

  it('exige nome da igreja', () => {
    expect(churchSchema.safeParse({ churchName: ' ', ministryName: 'Louvor' }).success).toBe(false)
  })

  it('valida o convite', () => {
    const base = {
      role: 'member',
      ministryRoleIds: [],
      multiUse: false,
      expiresInDays: 7,
      email: '',
      supportLabel: '',
    }
    expect(inviteSchema.safeParse(base).success).toBe(true)
    // apoio: o líder escreve o que a pessoa faz
    expect(inviteSchema.safeParse({ ...base, role: 'support' }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...base, role: 'support', supportLabel: '  ' }).success).toBe(
      false,
    )
    expect(
      inviteSchema.safeParse({ ...base, role: 'support', supportLabel: 'Mesa de som' }).success,
    ).toBe(true)
    expect(inviteSchema.safeParse({ ...base, expiresInDays: 90 }).success).toBe(false)
    expect(inviteSchema.safeParse({ ...base, email: 'invalido' }).success).toBe(false)
  })
})
