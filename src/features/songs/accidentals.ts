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

// --- preferência salva no aparelho ---

const KEY = 'idex:acidentes'
const listeners = new Set<() => void>()
let current: AccidentalsPref | null = null

function read(): AccidentalsPref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'auto' || v === 'sharp' || v === 'flat') return v
  } catch {
    // sem acesso ao armazenamento: usa o padrão
  }
  return 'auto'
}

export function setAccidentalsPref(pref: AccidentalsPref) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    // segue só nesta tela
  }
  current = pref
  listeners.forEach((l) => l())
}

export function useAccidentalsPref(): AccidentalsPref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (current ??= read()),
  )
}

/** Grafia para o tom mostrado na tela, já com a escolha da pessoa. */
export function useAccidentals(key: string | null | undefined): Accidentals | null {
  return resolveAccidentals(useAccidentalsPref(), key)
}
