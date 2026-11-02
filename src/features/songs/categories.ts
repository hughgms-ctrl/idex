import { useQuery } from '@tanstack/react-query'
import type { CategorySlot } from '@domain/planning.ts'

import { supabase } from '@/lib/supabase'

export const categoryKeys = {
  list: (ministryId: string) => ['song-categories', ministryId] as const,
}

export type SongCategory = { id: string; name: string; sort_order: number }

/** Sugestão para começar (o líder ajusta à realidade do ministério). */
export const DEFAULT_CATEGORIES = ['Celebração', 'Louvor', 'Adoração', 'Ofertório', 'Ceia']

/** Tipos de música do ministério (celebração, adoração…), em ordem. */
export function useSongCategories(ministryId: string | undefined) {
  return useQuery({
    queryKey: categoryKeys.list(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_categories')
        .select('id, name, sort_order')
        .eq('ministry_id', ministryId ?? '')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data as SongCategory[]
    },
  })
}

/** Lê a estrutura do culto salva (jsonb) e descarta o que não for válido. */
export function parseSlots(raw: unknown, valid?: readonly string[]): CategorySlot[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((s: { categoryId?: unknown; count?: unknown }) => {
    const id = typeof s?.categoryId === 'string' ? s.categoryId : null
    const count = Number(s?.count)
    if (!id || !Number.isInteger(count) || count < 1 || count > 10) return []
    if (valid && !valid.includes(id)) return []
    return [{ categoryId: id, count }]
  })
}

/** "2 Celebração → 3 Adoração" */
export function describeSlots(
  slots: readonly CategorySlot[],
  nameOf: (id: string) => string | undefined,
): string {
  return slots.map((s) => `${s.count} ${nameOf(s.categoryId) ?? 'Tipo'}`).join(' → ')
}
