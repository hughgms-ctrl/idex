import type { ChurchInput } from '@/lib/schemas'

// Quando o Supabase exige confirmar o e-mail, o cadastro da igreja fica
// guardado no aparelho até a pessoa voltar logada.
const KEY = 'idex.pendingChurch'

export function savePendingChurch(value: ChurchInput) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // sem armazenamento: a pessoa digita de novo
  }
}

export function readPendingChurch(): ChurchInput | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ChurchInput) : null
  } catch {
    return null
  }
}

export function clearPendingChurch() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignora
  }
}
