// Tons e transposição (funções puras). A cifra em si é tratada pelo chordsheetjs.

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
// Grafia mais comum de cada tom no louvor brasileiro
const PREFERRED_MAJOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const PREFERRED_MINOR = [
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'Bbm',
  'Bm',
]

export const KEY_OPTIONS = [...PREFERRED_MAJOR, ...PREFERRED_MINOR]

export type ParsedKey = { root: number; minor: boolean }

export function parseKey(key: string | null | undefined): ParsedKey | null {
  const m = key?.trim().match(/^([A-G])([#b]?)(m?)$/)
  if (!m) return null
  const name = `${m[1]}${m[2] ?? ''}`
  const idx = SHARPS.indexOf(name) >= 0 ? SHARPS.indexOf(name) : FLATS.indexOf(name)
  if (idx < 0) return null
  return { root: idx, minor: m[3] === 'm' }
}

export function formatKey(k: ParsedKey): string {
  return (k.minor ? PREFERRED_MINOR : PREFERRED_MAJOR)[((k.root % 12) + 12) % 12] ?? 'C'
}

/** Tom deslocado em semitons. */
export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key)
  if (!k) return key
  return formatKey({ ...k, root: k.root + semitones })
}

/** Menor distância em semitons de um tom para outro (−5..+6). */
export function semitonesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): number {
  const a = parseKey(from)
  const b = parseKey(to)
  if (!a || !b) return 0
  let d = (((b.root - a.root) % 12) + 12) % 12
  if (d > 6) d -= 12
  return d
}

/** Normaliza o texto digitado ("bb" → "Bb", "f#M" → "F#m"). */
export function normalizeKey(input: string): string | null {
  const m = input.trim().match(/^([a-gA-G])([#b♯♭]?)(m|M|min)?$/)
  if (!m) return null
  const accidental = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : (m[2] ?? '')
  const minor = m[3] === 'm' || m[3] === 'min'
  const k = parseKey(`${m[1]!.toUpperCase()}${accidental}${minor ? 'm' : ''}`)
  return k ? formatKey(k) : null
}
