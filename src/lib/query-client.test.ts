import { describe, expect, it } from 'vitest'

import { shouldPersistQuery } from '@/lib/query-client'

describe('cache offline', () => {
  it('guarda escala, setlist e cifras', () => {
    expect(
      shouldPersistQuery({ queryKey: ['songs', 'setlist', 'x'], state: { status: 'success' } }),
    ).toBe(true)
    expect(
      shouldPersistQuery({ queryKey: ['schedule', 'mine', 'x'], state: { status: 'success' } }),
    ).toBe(true)
  })

  it('não guarda convites, auditoria nem consultas com erro', () => {
    expect(shouldPersistQuery({ queryKey: ['invites', 'x'], state: { status: 'success' } })).toBe(
      false,
    )
    expect(shouldPersistQuery({ queryKey: ['songs', 'list'], state: { status: 'error' } })).toBe(
      false,
    )
  })
})
