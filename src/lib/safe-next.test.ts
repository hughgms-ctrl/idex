import { describe, expect, it } from 'vitest'

import { safeNext } from '@/lib/safe-next'

describe('safeNext', () => {
  it('aceita caminhos internos', () => {
    expect(safeNext('/membros?convidar=1')).toBe('/membros?convidar=1')
  })

  it('bloqueia redirecionamento para outros sites', () => {
    expect(safeNext('https://malicioso.com')).toBe('/')
    expect(safeNext('//malicioso.com')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })
})
