import { describe, expect, it } from 'vitest'

import { isMobile, setupStep } from './setup'

describe('aviso para instalar e ativar', () => {
  it('no celular pede o que falta', () => {
    expect(setupStep({ mobile: true, push: 'needs-install' })).toBe('install-ios')
    expect(setupStep({ mobile: true, push: 'off' })).toBe('enable')
    expect(setupStep({ mobile: true, push: 'denied' })).toBe('denied')
    expect(setupStep({ mobile: true, push: 'on' })).toBeNull()
    expect(setupStep({ mobile: true, push: 'loading' })).toBeNull()
  })

  it('no computador não insiste', () => {
    expect(setupStep({ mobile: false, push: 'off' })).toBeNull()
  })

  it('reconhece celular', () => {
    expect(isMobile('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile', 5)).toBe(true)
    expect(isMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/156', 0)).toBe(false)
  })
})
