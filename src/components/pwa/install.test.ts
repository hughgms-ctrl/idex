import { describe, expect, it } from 'vitest'

import { isIos } from '@/components/pwa/install'

describe('isIos', () => {
  it('reconhece iPhone', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true)
  })

  it('reconhece iPad que se apresenta como Mac', () => {
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
  })

  it('não confunde Android nem Mac de verdade', () => {
    expect(isIos('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe(false)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
  })
})
