import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowDown, ChevronLeft, Pause, Pencil } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { Button } from '@/components/ui/button'
import { useChurch } from '@/features/church/church-context'
import { ChordSheet } from '@/features/songs/ChordSheet'
import { SongFiles } from '@/features/songs/SongFiles'
import { useSetlist, useSong } from '@/features/songs/queries'
import { semitonesBetween, transposeKey } from '@/lib/music'
import { cn } from '@/lib/utils'

const SPEEDS = [12, 20, 30, 45] // pixels por segundo

export function SongPage() {
  const { songId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { isLeader } = useChurch()
  const song = useSong(songId)
  const eventId = params.get('culto') ?? undefined
  const setlist = useSetlist(eventId)
  const targetKey = params.get('tom')
  const [semi, setSemi] = useState<number | null>(null)
  const [lyricsOnly, setLyricsOnly] = useState(false)
  const [fontScale, setFontScale] = useState(1)
  const [scrolling, setScrolling] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(1)
  useAutoScroll(scrolling, SPEEDS[speedIdx] ?? 20, () => setScrolling(false))

  if (song.error) return <ErrorState error={song.error} onRetry={() => void song.refetch()} />
  if (song.isPending) return <FullScreenLoader />
  if (!song.data) return <ErrorState error="Música não encontrada." />

  const s = song.data
  const baseSemi = semitonesBetween(s.original_key, targetKey)
  const semitones = semi ?? baseSemi
  const currentKey = s.original_key ? transposeKey(s.original_key, semitones) : null
  const items = setlist.data?.setlist_items ?? []
  const index = items.findIndex((i) => i.song_id === s.id)
  const next = index >= 0 ? items[index + 1] : undefined
  const event = setlist.data ? { id: setlist.data.event_id } : null

  const subtitle = [
    index >= 0 && setlist.data ? `${index + 1}ª do setlist` : null,
    s.artist,
    s.bpm ? `${s.bpm} BPM` : null,
    s.time_signature,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="-mx-5 -mt-5 flex flex-col md:-mx-8 md:-mt-8">
      <header className="flex items-center gap-2 px-3 pt-4 pb-1">
        <Button variant="ghost" size="icon" aria-label="Voltar" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-[22px]" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <h1 className="truncate text-[17px] font-semibold">{s.title}</h1>
          {subtitle && <p className="text-muted-foreground truncate text-xs">{subtitle}</p>}
        </div>
        {isLeader(s.ministry_id) && (
          <Button asChild variant="ghost" size="icon" aria-label="Editar música">
            <Link to={`/repertorio/${s.id}/editar`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
        )}
      </header>

      <div className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-5 pt-2 pb-3">
        <Button
          variant="outline"
          size="icon"
          className="font-mono text-lg"
          aria-label="Baixar meio tom"
          onClick={() => setSemi(semitones - 1)}
        >
          −
        </Button>
        <div className="flex min-w-16 flex-col items-center">
          <span className="text-muted-foreground text-[11px]">TOM</span>
          <span className="text-primary font-mono text-xl font-semibold">{currentKey ?? '—'}</span>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="font-mono text-lg"
          aria-label="Subir meio tom"
          onClick={() => setSemi(semitones + 1)}
        >
          +
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          aria-pressed={lyricsOnly}
          className={cn(lyricsOnly && 'border-primary text-primary')}
          onClick={() => setLyricsOnly((v) => !v)}
        >
          Só letra
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={scrolling}
          className={cn(scrolling && 'border-primary text-primary')}
          onClick={() => setScrolling((v) => !v)}
        >
          {scrolling ? <Pause aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
          Rolagem
        </Button>
        <div className="text-muted-foreground flex w-full items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1">
            Letra
            <Button
              variant="ghost"
              size="sm"
              aria-label="Diminuir letra"
              onClick={() => setFontScale((f) => Math.max(0.8, f - 0.1))}
            >
              A−
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Aumentar letra"
              onClick={() => setFontScale((f) => Math.min(1.6, f + 0.1))}
            >
              A+
            </Button>
          </span>
          {scrolling && (
            <span className="flex items-center gap-1">
              Velocidade
              {SPEEDS.map((_, i) => (
                <Button
                  key={i}
                  variant={i === speedIdx ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-label={`Velocidade ${i + 1}`}
                  onClick={() => setSpeedIdx(i)}
                >
                  {i + 1}
                </Button>
              ))}
            </span>
          )}
          {semitones !== baseSemi && (
            <Button variant="ghost" size="sm" onClick={() => setSemi(null)}>
              Voltar ao tom {targetKey ? 'do culto' : 'original'}
            </Button>
          )}
        </div>
      </div>

      <div className="px-5 pt-4">
        <SongFiles songId={s.id} churchId={s.church_id} canEdit={isLeader(s.ministry_id)} />
      </div>

      <article className="px-5 pt-4 pb-8">
        <ChordSheet
          chordpro={s.chordpro}
          semitones={semitones}
          lyricsOnly={lyricsOnly}
          fontScale={fontScale}
        />
        {targetKey && s.original_key && targetKey !== s.original_key && (
          <p className="text-muted-foreground mt-6 border-t pt-3 text-xs">
            Tom original: {s.original_key}. O tom do culto foi definido pelo ministro e vale para
            todos.
          </p>
        )}
        {next && event && (
          <Button asChild variant="outline" className="mt-6 w-full justify-between">
            <Link
              to={`/repertorio/${next.song_id}?culto=${event.id}${next.key ? `&tom=${encodeURIComponent(next.key)}` : ''}`}
              replace
            >
              Próxima: {next.songs?.title}
              <span className="text-primary font-mono">{next.key ?? next.songs?.original_key}</span>
            </Link>
          </Button>
        )}
        {eventId && setlist.data && (
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link to={`/repertorio/culto/${eventId}`}>Ver setlist completo</Link>
          </Button>
        )}
      </article>
    </div>
  )
}

/** Rolagem automática suave; mantém a tela acesa enquanto rola. */
function useAutoScroll(active: boolean, pxPerSecond: number, onEnd: () => void) {
  const onEndRef = useRef(onEnd)
  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

  useEffect(() => {
    if (!active) return
    let frame = 0
    let last = performance.now()
    let carry = 0
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined)
    const tick = (now: number) => {
      carry += ((now - last) / 1000) * pxPerSecond
      last = now
      const whole = Math.floor(carry)
      if (whole > 0) {
        carry -= whole
        window.scrollBy(0, whole)
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
          onEndRef.current()
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      void lock?.release().catch(() => undefined)
    }
  }, [active, pxPerSecond])
}
