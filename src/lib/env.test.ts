import { describe, expect, it } from 'vitest'

import { resolveSupabaseUrl } from '@/lib/env'

describe('resolveSupabaseUrl', () => {
  const local = 'http://127.0.0.1:54321'

  it('no computador usa o Supabase local direto', () => {
    expect(
      resolveSupabaseUrl(local, { hostname: 'localhost', origin: 'http://localhost:5173' }),
    ).toBe(local)
  })

  it('no celular/túnel usa o repasse do Vite', () => {
    expect(
      resolveSupabaseUrl(local, { hostname: '192.168.0.10', origin: 'https://192.168.0.10:5173' }),
    ).toBe('https://192.168.0.10:5173/supabase')
  })

  it('Supabase na nuvem nunca é trocado', () => {
    const cloud = 'https://abc.supabase.co'
    expect(
      resolveSupabaseUrl(cloud, { hostname: 'idex.vercel.app', origin: 'https://idex.vercel.app' }),
    ).toBe(cloud)
  })
})
