import { describe, expect, it } from 'vitest'

import { errorMessage } from '@/lib/errors'

describe('errorMessage', () => {
  it('traduz erros de login', () => {
    expect(errorMessage({ message: 'Invalid login credentials' })).toBe(
      'E-mail ou senha incorretos.',
    )
  })

  it('traduz falta de permissão (RLS)', () => {
    expect(
      errorMessage({ message: 'new row violates row-level security policy', code: '42501' }),
    ).toBe('Você não tem permissão para fazer isso.')
  })

  it('mantém as mensagens das nossas RPCs', () => {
    expect(errorMessage({ message: 'Este convite expirou', code: '22023' })).toBe(
      'Este convite expirou',
    )
  })

  it('reconhece falta de internet', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Sem conexão/)
  })

  it('usa a mensagem padrão quando não há detalhe', () => {
    expect(errorMessage(null)).toBe('Algo deu errado. Tente de novo.')
  })
})
