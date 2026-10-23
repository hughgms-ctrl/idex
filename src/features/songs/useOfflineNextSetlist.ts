import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { songKeys, useSetlist } from '@/features/songs/queries'

/** Guarda no aparelho o setlist e as cifras do próximo culto (uso offline). */
export function useOfflineNextSetlist(eventId: string | undefined) {
  const queryClient = useQueryClient()
  const setlist = useSetlist(eventId)
  useEffect(() => {
    for (const item of setlist.data?.setlist_items ?? []) {
      if (item.songs) queryClient.setQueryData(songKeys.detail(item.song_id), item.songs)
    }
  }, [setlist.data, queryClient])
}
