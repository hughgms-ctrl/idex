// Conversão e leitura de cifras com chordsheetjs. Fica fora do pacote
// principal (só as telas de cifra importam este arquivo).
import {
  ChordLyricsPair,
  ChordProFormatter,
  ChordProParser,
  ChordsOverWordsParser,
  Tag,
} from 'chordsheetjs'

const SECTION_RE =
  /^\s*\[?\s*(((primeira|segunda|terceira|quarta|quinta)\s+)?(intro|introdução|verso|estrofe|parte|refr[aã]o|pr[eé][- ]?refr[aã]o|coro|ponte|ponte instrumental|final|outro|solo|interl[uú]dio|tag|vamp)(\s*\d+)?)\s*:?\s*\]?\s*$/i

const PLACEHOLDER = '§§SECAO§§'

// Copiar do Cifra Club traz caracteres invisíveis no começo das linhas
// (espaço de largura zero) e espaços especiais; sem limpar, as linhas de
// acordes não são reconhecidas e a cifra não muda de tom.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g

export function cleanPastedText(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/\r\n?/g, '\n')
}

const CHORD_TOKEN =
  /^\(?[A-G][#b]?(?:maj|min|dim|aug|sus|add|[mM]|[0-9]|[#b+°º()-])*(?:\/(?:[A-G][#b]?|[0-9]+))?\)?$/

export function isChordToken(token: string): boolean {
  return CHORD_TOKEN.test(token)
}

/** Linha só de acordes (ex.: "   C (C4) C  C9"). */
export function isChordLine(line: string): boolean {
  const tokens = line
    .trim()
    .split(/\s+/)
    .filter((t) => t && !/^[|/\\x0-9-]+$/i.test(t) && !/^x\d+$/i.test(t))
  return tokens.length > 0 && tokens.every(isChordToken)
}

const BRACKET_LABEL = /^\s*\[([^\]]{2,40})\]\s*(.*)$/

/** "Acordes sobre a letra" (texto colado de site/WhatsApp) → ChordPro. */
export function chordsOverWordsToChordPro(
  text: string,
  meta: { title?: string; key?: string | null } = {},
): string {
  const labels: string[] = []
  const label = (name: string) => {
    labels.push(capitalize(name.trim()))
    return `${PLACEHOLDER}${labels.length - 1}`
  }
  const prepared = cleanPastedText(text)
    .split('\n')
    .filter((line) => !/^\{(title|key|t|k):/i.test(line.trim()))
    .flatMap((line) => {
      const m = line.match(SECTION_RE)
      if (m?.[1]) return [label(m[1])]
      // "[Intro] C  G" ou "[Pós-refrão]": rótulo entre colchetes (não acorde)
      const b = line.match(BRACKET_LABEL)
      if (b?.[1] && !isChordToken(b[1].trim())) {
        const rest = b[2] ?? ''
        return rest.trim() ? [label(b[1]), rest] : [label(b[1])]
      }
      return [line]
    })
    .join('\n')
  const song = new ChordsOverWordsParser().parse(prepared)
  let body = new ChordProFormatter().format(song)
  body = body.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)`, 'g'),
    (_, i: string) => `{comment: ${labels[Number(i)]}}`,
  )
  const header = [
    meta.title ? `{title: ${meta.title}}` : null,
    meta.key ? `{key: ${meta.key}}` : null,
  ].filter(Boolean)
  // o formatter repete título/tom se existirem; removemos para não duplicar
  body = body
    .split('\n')
    .filter((l) => !/^\{(title|key):/.test(l))
    .join('\n')
    .trim()
  return [...header, body].join('\n').trim() + '\n'
}

/** Já está em ChordPro (acordes entre colchetes dentro da letra)? */
export function looksLikeChordPro(text: string): boolean {
  const lines = cleanPastedText(text).split('\n')
  const chordLines = lines.filter((l) => isChordLine(l)).length
  const inline = lines.filter((l) =>
    [...l.matchAll(/\[([^\]]+)\]/g)].some((m) => isChordToken((m[1] ?? '').trim())),
  ).length
  if (chordLines >= 2 && chordLines > inline) return false
  return inline > 0 || /^\{[a-z_]+(:.*)?\}\s*$/m.test(text)
}

/**
 * Cifras salvas antes da correção ficaram como texto puro com cabeçalho
 * ChordPro. Ao ler, convertemos de novo (mantendo título e tom).
 */
export function repairChordPro(text: string): string {
  const clean = cleanPastedText(text)
  if (looksLikeChordPro(clean)) return clean
  const title = clean.match(/^\{title:\s*(.*?)\}\s*$/m)?.[1]
  const key = clean.match(/^\{key:\s*(.*?)\}\s*$/m)?.[1]
  return chordsOverWordsToChordPro(clean, { title, key })
}

/** `note`: texto entre colchetes que não é acorde ("[Crescendo]", "[pausa]"): não muda de tom. */
export type SheetSegment = { chord: string; lyrics: string; note?: string }
export type SheetLine = { segments: SheetSegment[] }
export type SheetSection = { label: string | null; lines: SheetLine[] }

const PARAGRAPH_LABEL: Record<string, string> = {
  verse: 'Verso',
  chorus: 'Refrão',
  bridge: 'Ponte',
  tab: 'Tablatura',
}

/**
 * "[Crescendo]", "[pausa]", "[2x]": o leitor de ChordPro trataria como acorde
 * (e "Crescendo" viraria "Erescendo" ao mudar o tom). Viram anotação ("[*…]"),
 * que aparece no lugar do acorde mas nunca é transposta.
 */
export function markNotes(chordpro: string): string {
  return chordpro.replace(/\[([^\]*\n][^\]\n]*)\]/g, (whole, inner: string) =>
    isChordToken(inner.trim()) ? whole : `[*${inner}]`,
  )
}

/** ChordPro → seções/linhas prontas para desenhar, já transpostas. */
export function readChordPro(chordpro: string, semitones = 0): SheetSection[] {
  let song = new ChordProParser().parse(markNotes(repairChordPro(chordpro || '')))
  if (semitones) song = song.transpose(semitones)
  const sections: SheetSection[] = []
  for (const paragraph of song.paragraphs) {
    let current: SheetSection = {
      label: paragraph.label ?? PARAGRAPH_LABEL[paragraph.type] ?? null,
      lines: [],
    }
    for (const line of paragraph.lines) {
      const segments: SheetSegment[] = []
      for (const item of line.items) {
        if (item instanceof ChordLyricsPair) {
          const note = item.annotation?.trim()
          segments.push({
            chord: item.chords ?? '',
            lyrics: item.lyrics ?? '',
            ...(note ? { note } : {}),
          })
        } else if (item instanceof Tag && item.name === 'comment' && item.value) {
          // comentário vira o rótulo de uma nova seção
          if (current.lines.length > 0 || current.label) sections.push(current)
          current = { label: item.value, lines: [] }
        }
      }
      if (segments.some((s) => s.chord || s.note || s.lyrics.trim())) {
        current.lines.push({ segments })
      }
    }
    if (current.lines.length > 0 || current.label) sections.push(current)
  }
  // rótulo seguido de linha em branco: junta com o parágrafo seguinte
  const merged: SheetSection[] = []
  for (const section of sections) {
    const prev = merged[merged.length - 1]
    if (prev && prev.label && prev.lines.length === 0 && !section.label) {
      prev.lines.push(...section.lines)
    } else if (section.lines.length > 0 || section.label) {
      merged.push(section)
    }
  }
  return merged
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export type SheetTextLine = { kind: 'label' | 'chords' | 'lyrics' | 'blank'; text: string }

/**
 * Cifra em texto, como aparece na tela: acordes na linha de cima, alinhados
 * com a sílaba, e a letra inteira embaixo (para colar no telão/WhatsApp).
 * A letra nunca é quebrada no meio da palavra: se dois acordes se encostam,
 * o seguinte anda para a direita. `lyricsOnly`: só a letra.
 * O alinhamento por espaços só fica certo em fonte de largura fixa; por isso
 * a cópia também leva a versão HTML (`sheetToHtml`), já em fonte fixa.
 */
export function sheetToLines(sections: SheetSection[], lyricsOnly = false): SheetTextLine[] {
  const out: SheetTextLine[] = []
  for (const section of sections) {
    const block: SheetTextLine[] = []
    if (section.label) block.push({ kind: 'label', text: section.label })
    for (const line of section.lines) {
      let chords = ''
      let lyrics = ''
      for (const seg of line.segments) {
        const mark = seg.chord || seg.note || ''
        if (mark && !lyricsOnly) {
          if (chords.length > lyrics.length) {
            // abre espaço na letra só entre palavras (ou onde não há letra)
            const between = lyrics === '' || /\s$/.test(lyrics) || !/^\S/.test(seg.lyrics)
            if (between) lyrics = lyrics.padEnd(chords.length)
          }
          chords = chords.padEnd(Math.max(lyrics.length, chords.length)) + mark + ' '
        }
        lyrics += seg.lyrics
      }
      chords = chords.trimEnd()
      lyrics = lyrics.trimEnd()
      if (chords) block.push({ kind: 'chords', text: chords })
      if (lyrics.trim()) block.push({ kind: 'lyrics', text: lyrics })
    }
    if (block.length === 0) continue
    if (out.length) out.push({ kind: 'blank', text: '' })
    out.push(...block)
  }
  return out
}

export function sheetToText(sections: SheetSection[], lyricsOnly = false): string {
  return sheetToLines(sections, lyricsOnly)
    .map((l) => l.text)
    .join('\n')
}

const escapeHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Mesma cópia em HTML com fonte de largura fixa (Word, PowerPoint, Docs mantêm o alinhamento). */
export function sheetToHtml(sections: SheetSection[], lyricsOnly = false): string {
  const body = sheetToLines(sections, lyricsOnly)
    .map((l) => {
      const t = escapeHtml(l.text)
      return l.kind === 'chords' || l.kind === 'label' ? `<b>${t}</b>` : t
    })
    .join('\n')
  return `<pre style="font-family: Consolas, 'Courier New', monospace; white-space: pre">${body}</pre>`
}
