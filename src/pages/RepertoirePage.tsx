import { useQuery } from '@tanstack/react-query'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { supabase } from '@/lib/supabase'

// Lista simples das músicas; cifra, transposição e setlist chegam na Fase 3.
export function RepertoirePage() {
  const { ministry } = useChurch()
  const songs = useQuery({
    queryKey: ['songs', ministry?.id],
    enabled: Boolean(ministry),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, artist, original_key, bpm')
        .eq('ministry_id', ministry?.id ?? '')
        .order('title')
      if (error) throw error
      return data
    },
  })

  return (
    <>
      <PageHeader
        title="Cifras"
        description="Cifras com transposição e setlist do culto chegam na próxima etapa."
      />
      {songs.error ? (
        <ErrorState error={songs.error} onRetry={() => void songs.refetch()} />
      ) : songs.isPending ? (
        <Skeleton className="h-40" />
      ) : songs.data.length === 0 ? (
        <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
          Nenhuma música cadastrada ainda.
        </Panel>
      ) : (
        <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          {songs.data.map((song, i) => (
            <li
              key={song.id}
              className="flex min-h-14 items-center gap-3 border-b px-3.5 py-3 last:border-b-0"
            >
              <span className="text-muted-foreground w-5 font-mono text-[13px]">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]">{song.title}</span>
                {song.artist && (
                  <span className="text-muted-foreground truncate text-xs">{song.artist}</span>
                )}
              </span>
              {song.original_key && (
                <span className="bg-secondary text-primary rounded-lg px-2 py-1 font-mono text-[13px] font-semibold">
                  {song.original_key}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
