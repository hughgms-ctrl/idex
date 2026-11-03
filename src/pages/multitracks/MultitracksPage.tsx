import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Layers, Search } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { readMix } from '@/features/multitracks/mix'
import { mixerPath } from '@/features/multitracks/open-mixer'
import { useTrackCounts } from '@/features/multitracks/queries'
import { useSongs, type SongListItem } from '@/features/songs/queries'

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Entrada do Multitracks: músicas com 2 ou mais faixas (áudios). */
export function MultitracksPage() {
  const { church, ministry } = useChurch()
  const songs = useSongs(ministry?.id)
  const counts = useTrackCounts(church.id)
  const [query, setQuery] = useState('')

  const { ready, single } = useMemo(() => {
    const q = normalize(query.trim())
    const list = (songs.data ?? []).filter(
      (s) => !q || normalize([s.title, s.artist ?? ''].join(' ')).includes(q),
    )
    const n = (s: SongListItem) => counts.data?.[s.id] ?? 0
    return { ready: list.filter((s) => n(s) >= 2), single: list.filter((s) => n(s) === 1) }
  }, [songs.data, counts.data, query])

  const error = songs.error ?? counts.error
  if (error) return <ErrorState error={error} />
  const loading = songs.isPending || counts.isPending

  return (
    <>
      <PageHeader
        eyebrow="ESTUDO COM FAIXAS"
        title="Multitracks"
        description="Escolha a música, ligue as faixas no mixer (volume, mudo e solo) e toque todas juntas em cima da cifra, mudando tom e andamento de uma vez."
      />
      <div className="relative">
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          aria-label="Buscar música"
          placeholder="Buscar música"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {ready.length === 0 ? (
            <p className="bg-card text-muted-foreground rounded-2xl border p-4 text-sm">
              {query
                ? 'Nenhuma música com faixas encontrada.'
                : 'Nenhuma música tem 2 ou mais faixas ainda. Envie cada faixa (bateria, baixo, voz guia…) como um áudio separado na página de Áudios da música.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ready.map((s) => (
                <SongRow key={s.id} song={s} tracks={counts.data?.[s.id] ?? 0} />
              ))}
            </ul>
          )}
          {single.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wider">
                COM 1 ÁUDIO (ENVIE MAIS FAIXAS PARA USAR)
              </h2>
              <ul className="flex flex-col gap-1.5">
                {single.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/repertorio/${s.id}/audios`}
                      className="hover:bg-secondary/40 flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      <span className="text-muted-foreground text-xs">Áudios</span>
                      <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}

function SongRow({ song, tracks }: { song: SongListItem; tracks: number }) {
  const chosen = readMix(song.id).tracks.length
  return (
    <li>
      <Link
        to={mixerPath(song.id)}
        className="bg-card hover:border-primary/60 flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3"
      >
        <Layers className="text-primary size-5 shrink-0" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-medium">{song.title}</span>
          <span className="text-muted-foreground truncate text-xs">
            {[song.artist, `${tracks} faixas`, chosen ? `${chosen} na sua mixagem` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {song.original_key && (
          <span className="text-primary font-mono text-sm font-semibold">{song.original_key}</span>
        )}
        <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
      </Link>
    </li>
  )
}
