import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const planningKeys = {
  plan: (ministryId: string, start: string) => ['planning', ministryId, start] as const,
  rules: (ministryId: string) => ['planning', 'rules', ministryId] as const,
}

const SERVICE_SELECT =
  'id, title, starts_at, setlists(id, setlist_items(id, song_id, position, key)), schedule_assignments(ministry_member_id, ministry_role_id)'

type ServiceRow = {
  id: string
  title: string
  starts_at: string
  setlists: unknown
  schedule_assignments: { ministry_member_id: string; ministry_role_id: string | null }[]
}

/** setlists é 1:1 com o evento; o PostgREST pode devolver objeto ou lista. */
export function setlistOf(row: { setlists: unknown }) {
  const s = Array.isArray(row.setlists) ? row.setlists[0] : row.setlists
  return (s ?? null) as {
    id: string
    setlist_items: { id: string; song_id: string; position: number; key: string | null }[]
  } | null
}

/** Cultos do trimestre + histórico de 6 meses antes (para repetição e "nova"). */
export function usePlanData(ministryId: string | undefined, start: Date, end: Date) {
  return useQuery({
    queryKey: [...planningKeys.plan(ministryId ?? '', start.toISOString()), end.toISOString()],
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const historyStart = new Date(start.getTime() - 26 * 7 * 86_400_000)
      const [services, history, songs] = await Promise.all([
        supabase
          .from('events')
          .select(SERVICE_SELECT)
          .eq('ministry_id', ministryId ?? '')
          .eq('kind', 'service')
          .gte('starts_at', start.toISOString())
          .lt('starts_at', end.toISOString())
          .order('starts_at'),
        supabase
          .from('events')
          .select('id, starts_at, setlists(setlist_items(song_id))')
          .eq('ministry_id', ministryId ?? '')
          .eq('kind', 'service')
          .gte('starts_at', historyStart.toISOString())
          .lt('starts_at', start.toISOString()),
        supabase
          .from('songs')
          .select('id, title, original_key, is_new')
          .eq('ministry_id', ministryId ?? '')
          .order('title'),
      ])
      for (const r of [services, history, songs]) if (r.error) throw r.error
      return {
        services: (services.data ?? []) as ServiceRow[],
        history: (history.data ?? []).flatMap((e) =>
          (setlistOf(e as { setlists: unknown })?.setlist_items ?? []).map((i) => ({
            songId: i.song_id,
            date: e.starts_at,
          })),
        ),
        songs: songs.data ?? [],
      }
    },
  })
}

export function usePlanRules(ministryId: string | undefined) {
  return useQuery({
    queryKey: planningKeys.rules(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quarter_plan_rules')
        .select('*')
        .eq('ministry_id', ministryId ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
