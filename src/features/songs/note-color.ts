import { useSyncExternalStore } from 'react'

// Cor das anotações da cifra ("[Crescendo]", "[2x]"). Os rótulos de seção
// têm cor própria por parte (section-color.ts).
// É gosto de cada um: fica salva neste aparelho.

export const NOTE_COLORS = [
  { id: 'roxo', label: 'Roxo neon', value: '#c78bff' },
  { id: 'rosa', label: 'Rosa neon', value: '#ff5cc8' },
] as const

export type NoteColorId = (typeof NOTE_COLORS)[number]['id']

const KEY = 'idex:cor-indicacoes'
const listeners = new Set<() => void>()

export function noteColorValue(id: string | null | undefined): string {
  return (NOTE_COLORS.find((c) => c.id === id) ?? NOTE_COLORS[0]).value
}

function read(): NoteColorId {
  try {
    const v = localStorage.getItem(KEY)
    if (NOTE_COLORS.some((c) => c.id === v)) return v as NoteColorId
  } catch {
    // sem acesso ao armazenamento: usa o padrão
  }
  return NOTE_COLORS[0].id
}

export function setNoteColor(id: NoteColorId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // segue só nesta tela
  }
  current = id
  listeners.forEach((l) => l())
}

let current: NoteColorId | null = null

export function useNoteColor(): NoteColorId {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (current ??= read()),
  )
}
