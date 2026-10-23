import { describe, expect, it } from 'vitest'

import { cifraClubUrl, isCifraClubUrl, parseCifraClubHtml, slug } from './cifraclub.ts'

// Página de exemplo no formato do site (conteúdo fictício)
const PAGE = `<!doctype html><html><head>
<meta property="og:title" content="Canção Fictícia - Banda Exemplo - Cifra Club">
</head><body>
<h1 class="t1">Canção Fictícia</h1>
<h2 class="t3"><a href="/banda-exemplo/">Banda Exemplo</a></h2>
<span id="cifra_tom">tom: <a class="js-modal-trigger" href="#">G</a></span>
<div class="cifra_cnt"><pre>[Intro] <b>G</b>  <b>D</b>  <b>Em</b>  <b>C</b>

[Tab - Solo]
e|-----3-----|
B|---3---3---|

[Primeira Parte]
<b>G</b>          <b>D</b>
Quando a manh&atilde; chega devagar
<b>Em</b>              <b>C</b>
Eu me lembro que Tu est&aacute;s aqui

[Refr&atilde;o]
<b>G</b>         <b>D/F#</b>
Fiel, Tu &eacute;s fiel
</pre></div></body></html>`

describe('Cifra Club', () => {
  it('monta a URL a partir de artista e música', () => {
    expect(slug('Aline Barros')).toBe('aline-barros')
    expect(cifraClubUrl('Fernandinho', 'Uma Nova História')).toBe(
      'https://www.cifraclub.com.br/fernandinho/uma-nova-historia/',
    )
  })

  it('só aceita links do Cifra Club (https)', () => {
    expect(isCifraClubUrl('https://www.cifraclub.com.br/x/y/')).toBe(true)
    expect(isCifraClubUrl('http://www.cifraclub.com.br/x/y/')).toBe(false)
    expect(isCifraClubUrl('https://cifraclub.com.br.evil.com/x')).toBe(false)
    expect(isCifraClubUrl('file:///etc/passwd')).toBe(false)
  })

  it('extrai título, artista, tom e cifra sem tablatura', () => {
    const r = parseCifraClubHtml(
      PAGE,
      'https://www.cifraclub.com.br/banda-exemplo/cancao-ficticia/',
    )
    expect(r?.title).toBe('Canção Fictícia')
    expect(r?.artist).toBe('Banda Exemplo')
    expect(r?.key).toBe('G')
    expect(r?.text).toContain('Quando a manhã chega devagar')
    expect(r?.text).toContain('Refrão')
    expect(r?.text).toContain('Primeira Parte')
    expect(r?.text).not.toContain('e|-')
    expect(r?.text.split('\n').slice(0, 2)).toEqual(['Intro', 'G  D  Em  C'])
  })

  it('devolve null quando a página não tem cifra', () => {
    expect(parseCifraClubHtml('<html><body>Não encontrado</body></html>', 'x')).toBeNull()
  })
})
