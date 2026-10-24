import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarRange, ListMusic, Plus, Search } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { useNextServices, useSongs } from '@/features/songs/queries'
import { useOfflineNextSetlist } from '@/features/songs/useOfflineNextSetlist'
import { formatEventDate } from '@/lib/format'

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function RepertoirePage() {
  const { ministry, isLeader, can } = useChurch()
  const songs = useSongs(ministry?.id)
  const nextServices = useNextServices(ministry?.id)
  const [query, setQuery] = useState('')
  const leader = ministry ? isLeader(ministry.id) : false
  const canAddSongs = ministry ? can(ministry.id, 'songs') : false
  useOfflineNextSetlist(nextServices.data?.[0]?.id)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return songs.data ?? []
    return (songs.data ?? []).filter((s) =>
      normalize([s.title, s.artist ?? '', ...s.tags].join(' ')).includes(q),
    )
  }, [songs.data, query])

  return (
    <>
      <PageHeader
        title="Cifras"
        action={
          canAddSongs && (
            <div className="flex gap-2">
              {leader && (
                <Button asChild variant="outline">
                  <Link to="/planejamento">
                    <CalendarRange aria-hidden="true" /> Trimestre
                  </Link>
                </Button>
              )}
              <Button asChild>
                <Link to="/repertorio/nova">
                  <Plus aria-hidden="true" /> Nova música
                </Link>
              </Button>
            </div>
          )
        }
      />

      {nextServices.data && nextServices.data.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle title="Setlist dos próximos cultos" />
          <ul className="flex gap-2.5 overflow-x-auto pb-1">
            {nextServices.data.map((e) => {
              // setlists é 1:1 com o evento; o PostgREST pode devolver objeto ou lista
              const sl: unknown = e.setlists
              const first = (Array.isArray(sl) ? sl[0] : sl) as
                { setlist_items: { count: number }[] } | null | undefined
              const count = first?.setlist_items[0]?.count ?? 0
              return (
                <li key={e.id} className="shrink-0">
                  <Link
                    to={`/repertorio/culto/${e.id}`}
                    className="bg-card hover:border-input flex w-40 flex-col gap-1 rounded-2xl border p-3"
                  >
                    <span className="text-muted-foreground font-mono text-[13px]">
                      {formatEventDate(e.starts_at)}
                    </span>
                    <span className="truncate text-[15px] font-semibold">{e.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {count ? `${count} ${count === 1 ? 'música' : 'músicas'}` : 'Setlist vazio'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Buscar música"
          placeholder="Buscar por nome, artista ou etiqueta"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {songs.error ? (
        <ErrorState error={songs.error} onRetry={() => void songs.refetch()} />
      ) : songs.isPending ? (
        <Skeleton className="h-40" />
      ) : filtered.length === 0 ? (
        <Panel className="text-muted-foreground items-center gap-3 py-8 text-center text-sm">
          <ListMusic className="size-6" aria-hidden="true" />
          {query ? 'Nenhuma música encontrada.' : 'Nenhuma música cadastrada ainda.'}
        </Panel>
      ) : (
        <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          {filtered.map((song, i) => (
            <li key={song.id} className="border-b last:border-b-0">
              <Link
                to={`/repertorio/${song.id}`}
                className="hover:bg-secondary/50 flex min-h-14 items-center gap-3 px-3.5 py-3"
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
