import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const songKeys = {
  all: ['songs'] as const,
  list: (ministryId: string) => ['songs', 'list', ministryId] as const,
  detail: (songId: string) => ['songs', 'detail', songId] as const,
  setlist: (eventId: string) => ['songs', 'setlist', eventId] as const,
  nextServices: (ministryId: string) => ['songs', 'next-services', ministryId] as const,
}

export function useSongs(ministryId: string | undefined) {
  return useQuery({
    queryKey: songKeys.list(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, artist, original_key, bpm, time_signature, tags')
        .eq('ministry_id', ministryId ?? '')
        .order('title')
      if (error) throw error
      return data
    },
  })
}

export type SongListItem = NonNullable<ReturnType<typeof useSongs>['data']>[number]

export function useSong(songId: string | undefined) {
  return useQuery({
    queryKey: songKeys.detail(songId ?? ''),
    enabled: Boolean(songId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('id', songId ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSetlist(eventId: string | undefined) {
  return useQuery({
    queryKey: songKeys.setlist(eventId ?? ''),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setlists')
        .select('id, notes, event_id, setlist_items(id, position, key, notes, song_id, songs(*))')
        .eq('event_id', eventId ?? '')
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        ...data,
        setlist_items: [...data.setlist_items].sort((a, b) => a.position - b.position),
      }
    },
  })
}

export type Setlist = NonNullable<NonNullable<ReturnType<typeof useSetlist>['data']>>
export type SetlistItem = Setlist['setlist_items'][number]

/** Próximos cultos (para o setlist). */
export function useNextServices(ministryId: string | undefined, limit = 4) {
  return useQuery({
    queryKey: [...songKeys.nextServices(ministryId ?? ''), limit],
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('events')
        .select('id, title, kind, starts_at, setlists(id, setlist_items(count))')
        .eq('ministry_id', ministryId ?? '')
        .eq('kind', 'service')
        .gte('starts_at', since)
        .order('starts_at')
        .limit(limit)
      if (error) throw error
      return data
    },
  })
}

/** Posso montar o setlist deste evento? (líder ou ministro escalado) */
export function useCanEditSetlist(eventId: string | undefined) {
  return useQuery({
    queryKey: ['songs', 'can-edit-setlist', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_edit_setlist_of_event', {
        p_event_id: eventId ?? '',
      })
      if (error) throw error
      return data
    },
  })
}

/** Página de cultos que já passaram (mais recentes primeiro), com as músicas do setlist. */
export const PAST_SERVICES_PAGE = 20

export function usePastServices(ministryId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['songs', 'past-services', ministryId ?? ''],
    enabled: Boolean(ministryId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      // mesmo corte de useNextServices: o que ainda não "passou" aparece lá
      const before = new Date(Date.now() - 6 * 3_600_000).toISOString()
      const { data, error } = await supabase
        .from('events')
        .select(
          'id, title, starts_at, setlists(id, setlist_items(position, key, songs(id, title)))',
        )
        .eq('ministry_id', ministryId ?? '')
        .eq('kind', 'service')
        .lt('starts_at', before)
        .order('starts_at', { ascending: false })
        .range(pageParam, pageParam + PAST_SERVICES_PAGE - 1)
      if (error) throw error
      return data.map((e) => {
        // setlists é 1:1 com o evento; o PostgREST pode devolver objeto ou lista
        const sl: unknown = e.setlists
        const first = (Array.isArray(sl) ? sl[0] : sl) as
          | {
              setlist_items: {
                position: number
                key: string | null
                songs: { id: string; title: string } | null
              }[]
            }
          | null
          | undefined
        const songs = [...(first?.setlist_items ?? [])]
          .sort((a, b) => a.position - b.position)
          .flatMap((i) => (i.songs ? [{ id: i.songs.id, title: i.songs.title, key: i.key }] : []))
        return { id: e.id, title: e.title, starts_at: e.starts_at, songs }
      })
    },
    getNextPageParam: (last, pages) =>
      last.length < PAST_SERVICES_PAGE ? undefined : pages.length * PAST_SERVICES_PAGE,
  })
}

export type PastService = NonNullable<
  ReturnType<typeof usePastServices>['data']
>['pages'][number][number]
