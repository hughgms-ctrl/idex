import { useSyncExternalStore } from 'react'

import { parseKey, formatKey } from '@/lib/music'

// Grafia dos acidentes na cifra: A# ou Bb, D# ou Eb. O transpositor escreve
// do jeito dele; aqui a pessoa escolhe (salvo neste aparelho). "Auto" segue o
// tom da tela: tom com bemol (F, Bb, Eb, Gm, Dm…) usa bemóis; com sustenido
// (G, D, A, E, Em…) usa sustenidos; C e Am deixam como está escrito.

export type Accidentals = 'sharp' | 'flat'
export type AccidentalsPref = 'auto' | Accidentals

export const ACCIDENTAL_OPTIONS: { id: AccidentalsPref; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automático', hint: 'Pelo tom (Bb usa bemóis, E usa sustenidos)' },
  { id: 'sharp', label: 'Sustenidos', hint: 'C# D# F# G# A#' },
  { id: 'flat', label: 'Bemóis', hint: 'Db Eb Gb Ab Bb' },
]

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const

function noteIndex(letter: string, accidental: string): number {
  const base = NATURAL[letter as keyof typeof NATURAL]
  return (base + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12
}

// tons cuja armadura tem bemóis, mesmo sem bemol no nome
const FLAT_KEYS = new Set(['F', 'Dm', 'Gm', 'Cm', 'Fm'])

/** Grafia que combina com o tom (null = tom sem acidentes ou desconhecido). */
export function accidentalsForKey(key: string | null | undefined): Accidentals | null {
  const k = parseKey(key)
  if (!k) return null
  const name = formatKey(k)
  if (name.includes('b') || FLAT_KEYS.has(name)) return 'flat'
  if (name === 'C' || name === 'Am') return null
  return 'sharp'
}

export function resolveAccidentals(
  pref: AccidentalsPref,
  key: string | null | undefined,
): Accidentals | null {
  return pref === 'auto' ? accidentalsForKey(key) : pref
}

// nota do acorde: no começo (talvez depois de "(") e no baixo ("/")
const ROOTS = /(^\(?|\/)([A-G])([#b]?)/g

/** Reescreve as notas do acorde ("A#m/D#" → "Bbm/Eb"); null mantém. */
export function spellChord(chord: string, mode: Accidentals | null): string {
  if (!mode) return chord
  const names = mode === 'flat' ? FLATS : SHARPS
  return chord.replace(
    ROOTS,
    (_, before: string, letter: string, acc: string) => before + names[noteIndex(letter, acc)],
  )
}

/** Muda o tom de um acorde escrito como texto (anotação "Intro: Gm A# F"). */
export function transposeChord(chord: string, semitones: number, mode: Accidentals | null): string {
  const names =
    mode === 'flat' ? FLATS : mode === 'sharp' ? SHARPS : chord.includes('b') ? FLATS : SHARPS
  return chord.replace(
    ROOTS,
    (_, before: string, letter: string, acc: string) =>
      before + names[(noteIndex(letter, acc) + semitones + 120) % 12],
  )
}

// --- escolha por música, salva no aparelho ---
// Cada música tem a sua (uma pede Bb, outra A#); sem escolha = Automático.

const KEY = 'idex:acidentes:musicas'
const OLD_KEY = 'idex:acidentes' // antes valia para todas as músicas
const listeners = new Set<() => void>()
let current: Record<string, AccidentalsPref> | null = null

function read(): Record<string, AccidentalsPref> {
  const out: Record<string, AccidentalsPref> = {}
  try {
    localStorage.removeItem(OLD_KEY)
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (raw && typeof raw === 'object') {
      for (const [id, v] of Object.entries(raw)) {
        if (v === 'sharp' || v === 'flat') out[id] = v
      }
    }
  } catch {
    // sem acesso ao armazenamento ou valor estragado: tudo automático
  }
  return out
}

/** Escolha de uma música ("auto" apaga a escolha). */
export function setAccidentalsPref(songId: string, pref: AccidentalsPref) {
  const next = { ...(current ??= read()) }
  if (pref === 'auto') delete next[songId]
  else next[songId] = pref
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // segue só nesta tela
  }
  current = next
  listeners.forEach((l) => l())
}

/** Escolhas de todas as músicas (id → sustenido/bemol). */
export function useAccidentalsPrefs(): Readonly<Record<string, AccidentalsPref>> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (current ??= read()),
  )
}

export function prefFor(
  prefs: Readonly<Record<string, AccidentalsPref>>,
  songId: string | null | undefined,
): AccidentalsPref {
  return (songId && prefs[songId]) || 'auto'
}

/** Escolha desta música (sem escolha: automático). */
export function useAccidentalsPref(songId: string | null | undefined): AccidentalsPref {
  return prefFor(useAccidentalsPrefs(), songId)
}

/** Grafia para o tom mostrado na tela, já com a escolha feita para a música. */
export function useAccidentals(
  songId: string | null | undefined,
  key: string | null | undefined,
): Accidentals | null {
  return resolveAccidentals(useAccidentalsPref(songId), key)
}
