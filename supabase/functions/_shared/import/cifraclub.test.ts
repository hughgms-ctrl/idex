import { describe, expect, it } from 'vitest'

import { cifraClubUrl, isCifraClubUrl, parseCifraClubHtml, shiftKey, slug } from './cifraclub.ts'

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

  it('desloca o tom', () => {
    expect(shiftKey('E', 2)).toBe('F#')
    expect(shiftKey('Em', 3)).toBe('Gm')
    expect(shiftKey('Bb', 2)).toBe('C')
    expect(shiftKey('x', 2)).toBeNull()
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

  it('sem capotraste: capo e forma vazios', () => {
    const r = parseCifraClubHtml(PAGE, 'x')
    expect(r?.capo).toBeNull()
    expect(r?.shapeKey).toBeNull()
  })

  it('lê o capotraste e a forma dos acordes', () => {
    const page = PAGE.replace(
      '<span id="cifra_tom">tom: <a class="js-modal-trigger" href="#">G</a></span>',
      '<span id="cifra_tom">tom: <a class="js-modal-trigger" href="#">F#</a> (forma dos acordes no tom de <b>E</b>)</span>' +
        '<span id="cifra_capo">Capotraste na <a href="#">2&ordf; casa</a></span>',
    )
    const r = parseCifraClubHtml(page, 'x')
    expect(r?.key).toBe('F#')
    expect(r?.capo).toBe(2)
    expect(r?.shapeKey).toBe('E')
    expect(r?.text).not.toMatch(/capotraste/i)
  })

  it('tom real pela conta quando o link traz a forma dos acordes', () => {
    const page = PAGE.replace(
      '<span id="cifra_tom">tom: <a class="js-modal-trigger" href="#">G</a></span>',
      '<span id="cifra_tom">tom: <b>F#</b> (forma dos acordes no tom de <a class="js-modal-trigger" href="#">E</a>)</span>' +
        '<span>Capotraste na 2&ordf; casa</span>',
    )
    const r = parseCifraClubHtml(page, 'x')
    expect(r?.key).toBe('F#')
    expect(r?.capo).toBe(2)
    expect(r?.shapeKey).toBe('E')
  })

  it('site novo: "Tom: F# (com forma de E)" e "Capotraste: 2ª casa"', () => {
    // trecho real da página (nov/2026), sem o h1 antigo nem #cifra_tom
    const page = `<!doctype html><html><head>
<meta property="og:title" content="Quem É Esse? - Julliany Souza - Cifra Club">
<style>.y0WYx[data-has-capo=true]{height:1px}.tAvU5[data-icon=capo]{}</style></head><body>
<p class="_5QAC" style="--lineClamp:1">Capotraste</p><span class="_QG2y"><p class="_5QAC">2ª casa</p></span>
<div class="ebNp" data-chord-config="true"><div class="IERZz"><span>Tom<!-- -->: </span> <button type="button" class="eVroG" data-anchor="--chord-tone" style="--anchorName:--chord-tone">F#<!-- --> (com forma de E)</button></div><div class="IERZz"><span>Capotraste<!-- -->:</span> <button type="button" class="eVroG" data-anchor="--chord-capo" style="--anchorName:--chord-capo">2ª casa</button></div></div>
<article data-chord-container="true"><pre class="_crVx" data-chord-content="true">[Intro] <b>A2</b>  <b>B2</b>  <b>C#m7</b>

[Primeira Parte]
            <b>A2</b>
Eu me deparei
</pre></article></body></html>`
    const r = parseCifraClubHtml(page, 'x')
    expect(r?.title).toBe('Quem É Esse?')
    expect(r?.artist).toBe('Julliany Souza')
    expect(r?.key).toBe('F#')
    expect(r?.capo).toBe(2)
    expect(r?.shapeKey).toBe('E')
  })

  it('site novo sem capotraste: só o tom', () => {
    const page = PAGE.replace(
      '<span id="cifra_tom">tom: <a class="js-modal-trigger" href="#">G</a></span>',
      '<div><span>Tom<!-- -->: </span> <button type="button" data-anchor="--chord-tone">Bb</button></div>',
    )
    const r = parseCifraClubHtml(page, 'x')
    expect(r?.key).toBe('Bb')
    expect(r?.capo).toBeNull()
  })

  it('sem o h1: título e artista pelo og:title', () => {
    const page = PAGE.replace(/<h1[\s\S]*?<\/h2>/, '')
    const r = parseCifraClubHtml(page, 'x')
    expect(r?.title).toBe('Canção Fictícia')
    expect(r?.artist).toBe('Banda Exemplo')
  })

  it('devolve null quando a página não tem cifra', () => {
    expect(parseCifraClubHtml('<html><body>Não encontrado</body></html>', 'x')).toBeNull()
  })
})
