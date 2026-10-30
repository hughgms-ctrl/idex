import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, Copy, Mic2 } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { eventTimeRows, hhmm } from '@/features/schedule/datetime'
import { ChordSheet } from '@/features/songs/ChordSheet'
import { readChordPro, sheetToText, songsToText } from '@/features/songs/chordpro'
import { useSupportEvent, type SupportSetlistItem } from '@/features/support/queries'
import { serviceKey, serviceSemitones, songHeading, teamByRole } from '@/features/support/support'
import { formatEventDate } from '@/lib/format'
import { cn } from '@/lib/utils'

// Culto visto pelo apoio: horários, equipe e setlist com a cifra no tom do culto.
export function SupportEventPage() {
  const { eventId = '' } = useParams()
  const event = useSupportEvent(eventId)
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  if (event.error) return <ErrorState error={event.error} onRetry={() => void event.refetch()} />
  if (event.isPending) return <FullScreenLoader />
  if (!event.data) return <ErrorState error="Culto não encontrado." />

  const e = event.data
  const team = teamByRole(e.team)
  const times = eventTimeRows(e)
  if (e.ends_at) times.push({ label: 'Término', time: hhmm(e.ends_at) })

  const copyAll = () =>
    void copyText(
      () =>
        songsToText(
          e.items.map((item, i) => ({
            heading: songHeading(i + 1, item.songs?.title ?? 'Música', serviceKey(item)),
            chordpro: item.songs?.chordpro ?? '',
            semitones: serviceSemitones(item),
          })),
          lyricsOnly,
        ),
      lyricsOnly ? 'Letras da setlist copiadas' : 'Setlist copiada com as cifras',
    )

  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link to="/apoio">
          <ArrowLeft aria-hidden="true" /> Agenda
        </Link>
      </Button>
      <PageHeader
        eyebrow="CULTO"
        title={e.title}
        description={`${formatEventDate(e.starts_at)}${e.location_name ? ` · ${e.location_name}` : ''}`}
      />

      <Panel>
        <SectionTitle title="Horários" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {times.map((row) => (
            <div key={row.label} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className={cn('font-mono', row.strong && 'text-primary font-semibold')}>
                {row.time}
              </dd>
            </div>
          ))}
        </dl>
        {e.rehearsals.length > 0 && (
          <ul className="flex flex-col gap-1.5 border-t pt-3 text-sm">
            {e.rehearsals.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="outline" className="text-info border-info/40">
                  <Mic2 aria-hidden="true" />
                  {r.group_name ? `Ensaio · ${r.group_name}` : 'Ensaio'}
                </Badge>
                <span>
                  {formatEventDate(r.starts_at)}
                  {r.ends_at ? `–${hhmm(r.ends_at)}` : ''}
                  {r.arrive_at ? ` · chegada ${hhmm(r.arrive_at)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {e.notes && <p className="text-muted-foreground border-t pt-3 text-sm">{e.notes}</p>}
      </Panel>

      <Panel>
        <SectionTitle title="Equipe" />
        {team.length === 0 ? (
          <p className="text-muted-foreground text-sm">A escala ainda não foi montada.</p>
        ) : (
          <dl className="flex flex-col gap-1.5 text-sm">
            {team.map((g) => (
              <div key={g.role} className="flex gap-3">
                <dt className="text-muted-foreground w-28 shrink-0">{g.role}</dt>
                <dd>{g.names.join(', ')}</dd>
              </div>
            ))}
          </dl>
        )}
      </Panel>

      <section className="flex flex-col gap-3">
        <SectionTitle
          title={`Setlist · ${e.items.length} ${e.items.length === 1 ? 'música' : 'músicas'}`}
        />
        {e.items.length === 0 ? (
          <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
            O ministro ainda não montou a setlist.
          </Panel>
        ) : (
          <>
            <p className="text-muted-foreground -mt-1 text-[13px]">
              As cifras já estão no tom definido pelo líder para este culto.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                aria-pressed={lyricsOnly}
                className={cn(lyricsOnly && 'border-primary text-primary')}
                onClick={() => setLyricsOnly((v) => !v)}
              >
                Só letra
              </Button>
              <Button onClick={copyAll}>
                <Copy aria-hidden="true" />
                {lyricsOnly ? 'Copiar todas as letras' : 'Copiar setlist com cifras'}
              </Button>
            </div>
            <ol className="flex flex-col gap-2">
              {e.items.map((item, i) => (
                <li key={item.id}>
                  <SongItem
                    item={item}
                    position={i + 1}
                    open={!!open[item.id]}
                    onToggle={() => setOpen((o) => ({ ...o, [item.id]: !o[item.id] }))}
                    lyricsOnly={lyricsOnly}
                  />
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </>
  )
}

function SongItem({
  item,
  position,
  open,
  onToggle,
  lyricsOnly,
}: {
  item: SupportSetlistItem
  position: number
  open: boolean
  onToggle: () => void
  lyricsOnly: boolean
}) {
  const song = item.songs
  const key = serviceKey(item)
  const semitones = serviceSemitones(item)
  const details = [song?.artist, song?.bpm ? `${song.bpm} BPM` : null, song?.time_signature]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-2xl border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-secondary/40 flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="text-muted-foreground w-5 text-center font-mono text-[13px]">
          {position}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-medium">{song?.title ?? 'Música'}</span>
          {details && <span className="text-muted-foreground truncate text-xs">{details}</span>}
        </span>
        <span className="flex flex-col items-center">
          <span className="text-muted-foreground text-[10px]">TOM</span>
          <span className="text-primary font-mono text-base font-semibold">{key ?? '—'}</span>
        </span>
        <ChevronDown
          className={cn('text-muted-foreground size-5 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t px-4 pt-3 pb-4">
          {item.notes && <p className="text-muted-foreground text-sm">{item.notes}</p>}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={!song?.chordpro}
            onClick={() =>
              void copyText(
                () => sheetToText(readChordPro(song?.chordpro ?? '', semitones), lyricsOnly),
                lyricsOnly ? 'Letra copiada' : `Cifra copiada no tom ${key ?? 'do culto'}`,
              )
            }
          >
            <Copy aria-hidden="true" />
            {lyricsOnly ? 'Copiar letra' : 'Copiar cifra'}
          </Button>
          <ChordSheet
            chordpro={song?.chordpro ?? ''}
            semitones={semitones}
            lyricsOnly={lyricsOnly}
          />
        </div>
      )}
    </div>
  )
}

async function copyText(build: () => string, success: string) {
  try {
    await navigator.clipboard.writeText(build())
    toast.success(success)
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie.')
  }
}
