// Cifra com capotraste: o site mostra o tom real ("tom: F#") mas escreve os
// acordes na forma do violão ("forma dos acordes no tom de E", capotraste na
// 2ª casa). A banda toca no tom real, então passamos os acordes para ele:
// cada acorde sobe o número de casas do capotraste. Funções puras.
import { accidentalsForKey, transposeChord } from '@/features/songs/accidentals'
import { isChordToken, transposeNote } from '@/features/songs/chordpro'
import { normalizeKey, transposeKey } from '@/lib/music'

export type CapoInfo = {
  /** casa do capotraste (1–11) */
  fret: number
  /** tom da forma dos acordes ("E"), se o texto disser */
  shapeKey: string | null
  /** tom real ("F#"), se o texto disser */
  realKey: string | null
}

const KEY = '([A-G][#b♯♭]?m?)'
// "Capotraste na 2ª casa", "Capo: 2", "capotraste na casa 2", "Capo 3ª"
const CAPO_RE = [
  /capo(?:traste)?\s*(?:na|no|em|:|-)?\s*(\d{1,2})\s*(?:ª|º|a|o)?(?:\s*(?:casa|traste))?/i,
  /capo(?:traste)?\s*(?:na|no|em)?\s*(?:casa|traste)\s*(\d{1,2})/i,
]
const CHORDPRO_CAPO = /^\s*\{capo:\s*(\d{1,2})\s*\}\s*$/im
const SHAPE_RE = new RegExp(
  `forma\\s+(?:dos\\s+acordes\\s+)?(?:no\\s+tom\\s+)?de\\s+${KEY}(?![\\w#])`,
  'i',
)
const REAL_KEY_RE = new RegExp(`^\\s*tom\\s*:?\\s*${KEY}(?![\\w#])`, 'im')

/** Linhas de cabeçalho que só falam de tom/capotraste (somem ao passar para o tom real). */
function isCapoLine(line: string): boolean {
  const t = line.trim()
  if (!t || t.length > 90) return false
  if (CHORDPRO_CAPO.test(t)) return true
  if (CAPO_RE.some((re) => re.test(t)) && /^(capo|tom|\()/i.test(t)) return true
  if (/^tom\s*:?\s*[A-G][#b]?m?$/i.test(t)) return true
  return /^tom\s*:?\s*[A-G]/i.test(t) && SHAPE_RE.test(t)
}

function key(raw: string | undefined): string | null {
  return raw ? normalizeKey(raw.replace('♯', '#').replace('♭', 'b')) : null
}

/** Acha a indicação de capotraste no texto colado/importado (null = sem capotraste). */
export function detectCapo(text: string): CapoInfo | null {
  let fret: number | null = null
  const directive = text.match(CHORDPRO_CAPO)
  if (directive?.[1]) fret = Number(directive[1])
  for (const re of CAPO_RE) {
    if (fret) break
    const m = text.match(re)
    if (m?.[1]) fret = Number(m[1])
  }
  if (!fret || fret < 1 || fret > 11) return null
  const shapeKey = key(text.match(SHAPE_RE)?.[1])
  const realKey = key(text.match(REAL_KEY_RE)?.[1])
  return { fret, shapeKey, realKey }
}

/**
 * Tom real da música: o que o texto/site disse; senão, a forma + capotraste;
 * senão, o tom já cadastrado.
 */
export function realKeyFor(info: CapoInfo, currentKey?: string | null): string | null {
  if (info.realKey && info.shapeKey) return info.realKey
  if (info.shapeKey) return transposeKey(info.shapeKey, info.fret)
  if (info.realKey) return info.realKey
  return normalizeKey(currentKey ?? '') ?? null
}

/** Tira do texto as linhas "Capotraste na 2ª casa" / "tom: F# (forma … de E)". */
export function stripCapoLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isCapoLine(line))
    .join('\n')
    .replace(/^\n+/, '')
}

/**
 * Sobe todos os acordes de uma cifra ChordPro em `semitones` (o número da
 * casa do capotraste). Anotações só de acordes ("[*Intro: E B]") sobem junto;
 * outras ("[*Crescendo]") e texto entre colchetes que não é acorde ficam.
 * O `{key: …}` passa a ser `realKey` (sem ele, fica) e o `{capo: …}` sai.
 */
export function transposeChordPro(
  chordpro: string,
  semitones: number,
  realKey: string | null,
): string {
  const mode = accidentalsForKey(realKey)
  const lines = chordpro.split('\n').filter((l) => !CHORDPRO_CAPO.test(l))
  const out = lines.map((line) => {
    const directive = line.match(/^\s*\{(key|k):\s*(.*?)\}\s*$/i)
    if (directive) return realKey ? `{key: ${realKey}}` : line
    if (/^\s*\{.*\}\s*$/.test(line)) return line
    return line.replace(/\[([^\]\n]+)\]/g, (whole, inner: string) => {
      if (inner.startsWith('*')) return `[*${transposeNote(inner.slice(1), semitones, mode)}]`
      return isChordToken(inner.trim()) ? `[${transposeChord(inner, semitones, mode)}]` : whole
    })
  })
  return out.join('\n')
}
