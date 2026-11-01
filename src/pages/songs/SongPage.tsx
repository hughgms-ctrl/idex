import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  Copy,
  ExternalLink,
  Pause,
  Pencil,
} from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { Button } from '@/components/ui/button'
import { useChurch } from '@/features/church/church-context'
import { AudioPlayer, type AudioFile } from '@/features/songs/AudioPlayer'
import { ChordSheet } from '@/features/songs/ChordSheet'
import { beatsPerBar } from '@/features/songs/audio-math'
import { readChordPro, sheetToHtml, sheetToText } from '@/features/songs/chordpro'
import { NOTE_COLORS, setNoteColor, useNoteColor } from '@/features/songs/note-color'
import { defaultAudio, useSongFiles } from '@/features/songs/song-files'
import { useAudioEngine } from '@/features/songs/useAudioEngine'
import { SongFiles } from '@/features/songs/SongFiles'
import { songLinks } from '@/features/songs/links'
import { useSetlist, useSong } from '@/features/songs/queries'
import { semitonesBetween, transposeKey } from '@/lib/music'
import { cn } from '@/lib/utils'

const SPEEDS = [12, 20, 30, 45] // pixels por segundo

export function SongPage() {
  const { songId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { can } = useChurch()
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
  const files = useSongFiles(songId)
  const engine = useAudioEngine()
  const [audioId, setAudioId] = useState<string | null>(null)
  const canEditSong = !!song.data && can(song.data.ministry_id, 'songs')
  const doubleTap = useDoubleTap(() => {
    if (!canEditSong) return
    window.getSelection()?.removeAllRanges()
    navigate(`/repertorio/${songId}/editar`)
  })

  if (song.error) return <ErrorState error={song.error} onRetry={() => void song.refetch()} />
  if (song.isPending) return <FullScreenLoader />
  if (!song.data) return <ErrorState error="Música não encontrada." />

  const s = song.data
  const audios = (files.data ?? []).filter((f) => f.kind === 'audio') as AudioFile[]
  // abre no áudio padrão; trocar vale só para esta pessoa, agora
  const audio = audios.find((a) => a.id === audioId) ?? defaultAudio(audios)
  // a cifra parte do tom do culto; sem ele, do tom cadastrado no áudio (que
  // pode não ser o original da música); e acompanha o tom mudado no player
  const audioKey = targetKey ? null : (audio?.musical_key ?? null)
  const baseSemi = semitonesBetween(s.original_key, targetKey ?? audioKey)
  const semitones = (semi ?? baseSemi) + engine.semitones
  const links = songLinks(s.links)
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
        {canEditSong && (
          <Button asChild variant="ghost" size="icon" aria-label="Editar música">
            <Link to={`/repertorio/${s.id}/editar`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
        )}
      </header>

      <div className="bg-background sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-5 pt-2 pb-3">
        {audio && (
          <div className="mb-1 w-full">
            <AudioPlayer
              key={audio.id}
              compact
              file={audio}
              files={audios}
              onSelect={(next) => {
                const wasPlaying = engine.playing
                engine.pause()
                setAudioId(next.id)
                if (next.url) {
                  void engine
                    .load(next.url, next.id)
                    .then((ok) => (ok && wasPlaying ? engine.play() : undefined))
                }
              }}
              songBpm={s.bpm}
              songKey={s.original_key}
              beats={beatsPerBar(s.time_signature)}
              engine={engine}
              manageHref={
                can(s.ministry_id, 'song_files') ? `/repertorio/${s.id}/audios` : undefined
              }
            />
          </div>
        )}
        <Button
          variant="outline"
          size="icon"
          className="font-mono text-lg"
          aria-label="Baixar meio tom"
          onClick={() => setSemi((semi ?? baseSemi) - 1)}
        >
          −
        </Button>
        <div className="flex min-w-16 flex-col items-center">
          <span className="text-muted-foreground text-[11px]">TOM</span>
          <span className="text-primary font-mono text-xl font-semibold">{currentKey ?? '—'}</span>
          {engine.semitones !== 0 && (
            <span className="text-muted-foreground text-[10px]">com o áudio</span>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="font-mono text-lg"
          aria-label="Subir meio tom"
          onClick={() => setSemi((semi ?? baseSemi) + 1)}
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
        <div className="text-muted-foreground flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
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
            <Button
              variant="ghost"
              size="sm"
              title="Copia no formato da tela (com “Só letra”, só a letra)"
              onClick={() => void copySheet(s.chordpro, semitones, lyricsOnly)}
            >
              <Copy aria-hidden="true" />
              {lyricsOnly ? 'Copiar letra' : 'Copiar cifra'}
            </Button>
          </span>
          <NoteColorPicker />
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
          {semi !== null && semi !== baseSemi && (
            <Button variant="ghost" size="sm" onClick={() => setSemi(null)}>
              Voltar ao tom {targetKey ? 'do culto' : audioKey ? 'do áudio' : 'original'}
            </Button>
          )}
        </div>
      </div>

      {links.length > 0 && (
        <nav aria-label="Links da música" className="flex flex-wrap gap-2 px-5 pt-4">
          {links.map((l) => (
            <Button key={l.url} asChild variant="outline" size="sm" className="min-h-11">
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" /> {l.label}
              </a>
            </Button>
          ))}
        </nav>
      )}

      <div className="px-5 pt-4">
        <SongFiles
          songId={s.id}
          churchId={s.church_id}
          canEdit={can(s.ministry_id, 'song_files')}
          showAudioLink={audios.length === 0}
        />
      </div>

      <article className="px-5 pt-4 pb-8">
        <div
          {...(canEditSong ? doubleTap : {})}
          className={cn(canEditSong && 'touch-manipulation')}
          title={canEditSong ? 'Clique duas vezes para editar' : undefined}
        >
          <ChordSheet
            chordpro={s.chordpro}
            semitones={semitones}
            lyricsOnly={lyricsOnly}
            fontScale={fontScale}
          />
        </div>
        {canEditSong && (
          <p className="text-muted-foreground mt-6 text-xs">
            Toque duas vezes na cifra para editar.
          </p>
        )}
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

/** Cor das anotações ("[Crescendo]"): gosto de cada um, salvo no aparelho. */
function NoteColorPicker() {
  const current = useNoteColor()
  const [open, setOpen] = useState(false)
  const chosen = NOTE_COLORS.find((c) => c.id === current) ?? NOTE_COLORS[0]
  return (
    <span className="flex items-center">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label={open ? 'Fechar cores' : 'Escolher cor das anotações'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="size-3.5 rounded-full" style={{ backgroundColor: chosen.value }} />
        Cor
        <ChevronDown
          aria-hidden="true"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </Button>
      {open && (
        <span role="radiogroup" aria-label="Cor das anotações da cifra" className="flex">
          {NOTE_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={current === c.id}
              aria-label={c.label}
              title={`Anotações em ${c.label.toLowerCase()}`}
              onClick={() => {
                setNoteColor(c.id)
                setOpen(false)
              }}
              className="flex size-9 items-center justify-center"
            >
              <span
                className={cn(
                  'size-5 rounded-full transition-transform',
                  current === c.id &&
                    'ring-foreground ring-offset-background scale-110 ring-2 ring-offset-2',
                )}
                style={{ backgroundColor: c.value }}
              />
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

async function copySheet(chordpro: string, semitones: number, lyricsOnly: boolean) {
  try {
    const sections = readChordPro(chordpro, semitones)
    const text = sheetToText(sections, lyricsOnly)
    // em HTML vai em fonte de largura fixa: Word/PowerPoint/Docs mantêm os acordes no lugar
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([sheetToHtml(sections, lyricsOnly)], { type: 'text/html' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(text) // navegador sem cópia em HTML
    }
    toast.success(lyricsOnly ? 'Letra copiada' : 'Cifra copiada')
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie.')
  }
}

/** Clique duplo (mouse) ou dois toques rápidos (celular) fora de botões e links. */
function useDoubleTap(onDouble: () => void) {
  const last = useRef({ t: 0, x: 0, y: 0 })
  const fired = useRef(0)
  const fire = (target: EventTarget) => {
    if (target instanceof Element && target.closest('a,button,input,select,textarea')) return
    const now = Date.now()
    if (now - fired.current < 700) return // o celular também manda o "dblclick"
    fired.current = now
    onDouble()
  }
  return {
    onDoubleClick: (e: { target: EventTarget }) => fire(e.target),
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const l = last.current
      if (e.timeStamp - l.t < 350 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 40) {
        last.current = { t: 0, x: 0, y: 0 }
        fire(e.target)
      } else {
        last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY }
      }
    },
  }
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
