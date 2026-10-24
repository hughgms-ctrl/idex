import { describe, expect, it } from 'vitest'

import { deviceLabel } from './device'

describe('nome do aparelho', () => {
  it('reconhece os aparelhos da equipe', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
      ),
    ).toBe('Computador Windows (Chrome)')
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone')
    expect(
      deviceLabel(
        'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toBe('Android (Chrome)')
    expect(deviceLabel(null)).toBe('Aparelho')
  })
})
