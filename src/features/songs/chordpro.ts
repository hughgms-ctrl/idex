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
  /^\s*\[?\s*((intro|introdução|verso|estrofe|parte|refr[aã]o|pr[eé][- ]?refr[aã]o|coro|ponte|ponte instrumental|final|outro|solo|interl[uú]dio|tag|vamp)(\s*\d+)?)\s*:?\s*\]?\s*$/i

const PLACEHOLDER = '§§SECAO§§'

/** "Acordes sobre a letra" (texto colado de site/WhatsApp) → ChordPro. */
export function chordsOverWordsToChordPro(
  text: string,
  meta: { title?: string; key?: string | null } = {},
): string {
  const labels: string[] = []
  const prepared = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const m = line.match(SECTION_RE)
      if (!m?.[1]) return line
      labels.push(capitalize(m[1].trim()))
      return `${PLACEHOLDER}${labels.length - 1}`
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

export function looksLikeChordPro(text: string): boolean {
  return /\[[A-G][^\]\s]{0,8}\]/.test(text) || /^\{[a-z_]+(:.*)?\}\s*$/m.test(text)
}

export type SheetSegment = { chord: string; lyrics: string }
export type SheetLine = { segments: SheetSegment[] }
export type SheetSection = { label: string | null; lines: SheetLine[] }

const PARAGRAPH_LABEL: Record<string, string> = {
  verse: 'Verso',
  chorus: 'Refrão',
  bridge: 'Ponte',
  tab: 'Tablatura',
}

/** ChordPro → seções/linhas prontas para desenhar, já transpostas. */
export function readChordPro(chordpro: string, semitones = 0): SheetSection[] {
  let song = new ChordProParser().parse(chordpro || '')
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
          segments.push({ chord: item.chords ?? '', lyrics: item.lyrics ?? '' })
        } else if (item instanceof Tag && item.name === 'comment' && item.value) {
          // comentário vira o rótulo de uma nova seção
          if (current.lines.length > 0 || current.label) sections.push(current)
          current = { label: item.value, lines: [] }
        }
      }
      if (segments.some((s) => s.chord || s.lyrics.trim())) current.lines.push({ segments })
    }
    if (current.lines.length > 0 || current.label) sections.push(current)
  }
  return sections.filter((s) => s.lines.length > 0 || s.label)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
