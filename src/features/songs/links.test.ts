import { describe, expect, it } from 'vitest'

import { songLinks } from './links'

describe('songLinks', () => {
  it('usa o nome dado ou o site, e ignora o que não é link', () => {
    expect(
      songLinks([
        { label: 'YouTube', url: 'https://youtu.be/abc' },
        { label: '', url: 'https://www.cifraclub.com.br/x/' },
        { label: 'Ruim', url: 'javascript:alert(1)' },
        { url: 'https://' },
        null,
      ]),
    ).toEqual([
      { label: 'YouTube', url: 'https://youtu.be/abc' },
      { label: 'cifraclub.com.br', url: 'https://www.cifraclub.com.br/x/' },
    ])
    expect(songLinks(null)).toEqual([])
  })
})
