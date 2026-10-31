import { describe, expect, it } from 'vitest'

import {
  chordsOverWordsToChordPro,
  isChordLine,
  looksLikeChordPro,
  markNotes,
  readChordPro,
  sheetToHtml,
  sheetToText,
  songsToText,
} from '@/features/songs/chordpro'

const COLADO = `Intro: G D

Verso 1
G          D
Quando a manhã chega devagar
Em              C
Eu me lembro que Tu estás aqui

Refrão
G         D
Fiel, Tu és fiel`

describe('chordpro', () => {
  it('converte acordes sobre a letra para ChordPro, com seções', () => {
    const pro = chordsOverWordsToChordPro(COLADO, { title: 'Fiel', key: 'G' })
    expect(pro).toContain('{title: Fiel}')
    expect(pro).toContain('{key: G}')
    expect(pro).toContain('{comment: Verso 1}')
    expect(pro).toContain('{comment: Refrão}')
    expect(pro).toMatch(/\[G\]Quando/)
    expect(looksLikeChordPro(pro)).toBe(true)
    expect(looksLikeChordPro(COLADO)).toBe(false)
  })

  it('lê seções e transpõe', () => {
    const pro = chordsOverWordsToChordPro(COLADO, { key: 'G' })
    const sections = readChordPro(pro, 2)
    const refrao = sections.find((s) => s.label === 'Refrão')
    const line = refrao?.lines[0]?.segments ?? []
    expect(line.map((s) => s.lyrics).join('')).toBe('Fiel, Tu és fiel')
    expect(line.map((s) => s.chord).filter(Boolean)).toEqual(['A', 'E'])
    expect(sections.map((s) => s.label)).toContain('Verso 1')
  })

  it('aceita o texto trazido do Cifra Club', () => {
    const texto = 'Intro\nG  D  Em  C\n\nPrimeira Parte\nG          D\nQuando a manhã chega devagar'
    const pro = chordsOverWordsToChordPro(texto)
    expect(pro).toContain('{comment: Intro}')
    expect(pro).toContain('{comment: Primeira parte}')
    const sections = readChordPro(pro)
    expect(sections[0]?.label).toBe('Intro')
    expect(sections[0]?.lines[0]?.segments.map((s) => s.chord).filter(Boolean)).toEqual([
      'G',
      'D',
      'Em',
      'C',
    ])
  })

  it('entende blocos de refrão do ChordPro', () => {
    const sections = readChordPro('{start_of_chorus}\n[C]Santo, [G/B]santo\n{end_of_chorus}')
    expect(sections[0]?.label).toBe('Refrão')
    expect(sections[0]?.lines[0]?.segments.map((s) => s.chord)).toEqual(['C', 'G/B'])
  })
})

describe('cifra copiada do Cifra Club', () => {
  const Z = '​' // espaço de largura zero que o site coloca em cada linha
  const colada = [
    `${Z}[Intro] C`,
    '',
    `${Z}[Primeira Parte]`,
    '',
    `${Z}                      Dm7`,
    `${Z}Linha inventada para teste`,
    `${Z}F                C9`,
    `${Z}  Outra linha qualquer`,
    `${Z}            C (C4) C  C9/E`,
    `${Z}Mais uma linha`,
  ].join('\n')

  it('converte mesmo com caracteres invisíveis e rótulos com acordes', () => {
    const pro = chordsOverWordsToChordPro(colada, { key: 'C' })
    expect(pro).not.toContain(Z)
    expect(pro).toContain('{comment: Intro}')
    expect(pro).toContain('{comment: Primeira parte}')
    expect(pro).toMatch(/\[Dm7\]/)
    const sheet = readChordPro(pro, 2)
    const chords = sheet.flatMap((s) => s.lines.flatMap((l) => l.segments.map((g) => g.chord)))
    expect(chords).toContain('Em7')
  })

  it('conserta cifra já salva sem conversão (cabeçalho + texto puro) e muda o tom', () => {
    const salva = `{title: Teste}\n{key: C}\n${colada}`
    expect(looksLikeChordPro(salva)).toBe(false)
    const up = readChordPro(salva, 2)
    const chords = up.flatMap((s) => s.lines.flatMap((l) => l.segments.map((g) => g.chord)))
    expect(chords).toEqual(expect.arrayContaining(['D', 'Em7', 'G', 'D9']))
    expect(up.map((s) => s.label)).toEqual(expect.arrayContaining(['Intro', 'Primeira parte']))
  })

  it('reconhece linhas só de acordes', () => {
    expect(isChordLine('   C (C4) C  C9')).toBe(true)
    expect(isChordLine('F7M  G/B  Am7(9)  Bb°')).toBe(true)
    expect(isChordLine('E eu canto')).toBe(false)
  })
})

describe('copiar a cifra', () => {
  const pro = `{comment: Verso}
Eu o louva[F]rei
Suas maravilhas cantarei
Não me calar[Dm7]ei

{comment: Interlúdio}
[F] [F] [F] [F]`

  it('acordes em cima, letra inteira embaixo, como na tela', () => {
    expect(sheetToText(readChordPro(pro))).toBe(
      [
        'Verso',
        '          F',
        'Eu o louvarei',
        'Suas maravilhas cantarei',
        '            Dm7',
        'Não me calarei',
        '',
        'Interlúdio',
        'F F F F',
      ].join('\n'),
    )
  })

  it('transposta e só a letra', () => {
    expect(sheetToText(readChordPro(pro, 2)).split('\n')[1]).toBe('          G')
    expect(sheetToText(readChordPro(pro), true)).toBe(
      'Verso\nEu o louvarei\nSuas maravilhas cantarei\nNão me calarei\n\nInterlúdio',
    )
  })

  it('acordes encostados não quebram a palavra', () => {
    const text = sheetToText(readChordPro('Lou[Bb9]va[C]i'))
    expect(text).toBe('   Bb9 C\nLouvai')
  })

  it('em HTML vai em fonte fixa', () => {
    const html = sheetToHtml(readChordPro('Eu o louva[F]rei'))
    expect(html).toContain('monospace')
    expect(html).toContain('<b>' + '&nbsp;'.repeat(10) + 'F</b>')
    expect(html).toContain('>Eu o louvarei<')
    expect(html).not.toContain('<pre')
  })
})

describe('texto entre colchetes que não é acorde', () => {
  it('vira anotação e não muda de tom', () => {
    expect(markNotes('[Crescendo]Tes[F9]tifico [pausa] [E7/9]')).toBe(
      '[*Crescendo]Tes[F9]tifico [*pausa] [E7/9]',
    )
    const line = readChordPro('[Crescendo]Testifico [F]que', 4)[0]!.lines[0]!.segments
    expect(line[0]).toMatchObject({ chord: '', note: 'Crescendo', lyrics: 'Testifico ' })
    expect(line[1]).toMatchObject({ chord: 'A', lyrics: 'que' })
  })

  it('aparece na cópia no lugar do acorde', () => {
    expect(sheetToText(readChordPro('Deu[pausa]s', 2))).toBe('   pausa\nDeus')
  })
})

describe('songsToText', () => {
  it('junta as músicas com cabeçalho, cada uma no seu tom', () => {
    const text = songsToText([
      { heading: '1. Primeira — Tom: A', chordpro: '[G]Santo [D]és', semitones: 2 },
      { heading: '2. Segunda', chordpro: '', semitones: 0 },
    ])
    expect(text).toBe('1. Primeira — Tom: A\n\nA     E\nSanto és\n\n\n2. Segunda')
  })

  it('só letra', () => {
    expect(songsToText([{ heading: '1. X', chordpro: '[G]Santo [D]és', semitones: 2 }], true)).toBe(
      '1. X\n\nSanto és',
    )
  })
})
