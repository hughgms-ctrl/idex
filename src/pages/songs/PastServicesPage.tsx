import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Archive, ArrowLeft, Search } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { usePastServices, type PastService } from '@/features/songs/queries'
import { APP_TIMEZONE, formatEventDate } from '@/lib/format'

const MONTH = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIMEZONE,
  month: 'long',
  year: 'numeric',
})

function monthLabel(value: string): string {
  const label = MONTH.format(new Date(value))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Arquivo dos setlists de cultos que já passaram, para consulta. */
export function PastServicesPage() {
  const { ministry } = useChurch()
  const past = usePastServices(ministry?.id)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const all = past.data?.pages.flat() ?? []
    const q = normalize(query.trim())
    const filtered = q
      ? all.filter((e) =>
          normalize([e.title, ...e.songs.map((s) => s.title)].join(' ')).includes(q),
        )
      : all
    const byMonth: { month: string; events: PastService[] }[] = []
    for (const e of filtered) {
      const month = monthLabel(e.starts_at)
      const last = byMonth[byMonth.length - 1]
      if (last?.month === month) last.events.push(e)
      else byMonth.push({ month, events: [e] })
    }
    return byMonth
  }, [past.data, query])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/repertorio">
            <ArrowLeft aria-hidden="true" /> Músicas
          </Link>
        </Button>
      </div>
      <PageHeader title="Cultos passados" description="Setlists dos cultos que já aconteceram." />

      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Buscar culto ou música"
          placeholder="Buscar por culto ou música"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {past.error ? (
        <ErrorState error={past.error} onRetry={() => void past.refetch()} />
      ) : past.isPending ? (
        <Skeleton className="h-40" />
      ) : groups.length === 0 ? (
        <Panel className="text-muted-foreground items-center gap-3 py-8 text-center text-sm">
          <Archive className="size-6" aria-hidden="true" />
          {query
            ? past.hasNextPage
              ? 'Nada encontrado nos cultos carregados. Toque em "Carregar mais" para buscar mais antigos.'
              : 'Nenhum culto encontrado.'
            : 'Nenhum culto passado ainda.'}
        </Panel>
      ) : (
        groups.map((g) => (
          <section key={g.month} className="flex flex-col gap-2">
            <SectionTitle title={g.month} />
            <ul className="flex flex-col gap-2">
              {g.events.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/repertorio/culto/${e.id}`}
                    className="bg-card hover:border-input flex flex-col gap-1.5 rounded-2xl border p-3.5"
                  >
                    <span className="text-muted-foreground font-mono text-[13px]">
                      {formatEventDate(e.starts_at)}
                    </span>
                    <span className="text-[15px] font-semibold">{e.title}</span>
                    {e.songs.length === 0 ? (
                      <span className="text-muted-foreground text-xs">Setlist vazio</span>
                    ) : (
                      <ol className="text-muted-foreground flex flex-col gap-0.5 text-sm">
                        {e.songs.map((s, i) => (
                          <li key={`${s.id}-${i}`} className="flex items-baseline gap-2">
                            <span className="w-4 font-mono text-xs">{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate">{s.title}</span>
                            {s.key && (
                              <span className="text-primary font-mono text-xs font-semibold">
                                {s.key}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {past.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={past.isFetchingNextPage}
          onClick={() => void past.fetchNextPage()}
        >
          {past.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </Button>
      )}
    </>
  )
}
