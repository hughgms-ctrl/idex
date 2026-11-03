import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

/** Quantos áudios (faixas) cada música da igreja tem. */
export function useTrackCounts(churchId: string | undefined) {
  return useQuery({
    queryKey: ['multitracks', 'track-counts', churchId ?? ''],
    enabled: Boolean(churchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_files')
        .select('song_id')
        .eq('church_id', churchId ?? '')
        .eq('kind', 'audio')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of data) counts[row.song_id] = (counts[row.song_id] ?? 0) + 1
      return counts
    },
  })
}
