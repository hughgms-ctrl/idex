import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  Copy,
  ExternalLink,
  Layers,
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
import {
  ACCIDENTAL_OPTIONS,
  resolveAccidentals,
  setAccidentalsPref,
  spellChord,
  useAccidentalsPref,
  type Accidentals,
} from '@/features/songs/accidentals'
import { defaultAudio, useSongFiles } from '@/features/songs/song-files'
import { useAudioEngine } from '@/features/songs/useAudioEngine'
import { cleanMix, updateMix, useMix } from '@/features/multitracks/mix'
import { MultitrackBar } from '@/features/multitracks/MultitrackBar'
import { mixerPath, openMixerWindow, opensInNewWindow } from '@/features/multitracks/open-mixer'
import { useMultitrack } from '@/features/multitracks/useMultitrack'
import { SongFiles } from '@/features/songs/SongFiles'
import { songLinks } from '@/features/songs/links'
import { useSetlist, useSong } from '@/features/songs/queries'
import { semitonesBetween, transposeKey } from '@/lib/music'
import { cn } from '@/lib/utils'

const SPEEDS = [12, 20, 30, 45] // pixels por segundo

type SongRow = { id: string; original_key: string | null }
type FileRow = {
  id: string
  kind: string
  musical_key?: string | null
  is_default?: boolean | null
}

/** Áudio que está no player da tela (único ou 1ª faixa do Multitracks), com o tom dele. */
function linkedAudio(
  song: SongRow | null | undefined,
  files: FileRow[] | undefined,
  storedMix: Parameters<typeof cleanMix>[0],
  audioId: string | null,
): { identity: string; audioSemi: number; multitrack: boolean } | null {
  if (!song || !files) return null
  const audios = files.filter((f) => f.kind === 'audio')
  const mix = cleanMix(
    storedMix,
    audios.map((a) => a.id),
  )
  const multitrack = mix.active && mix.tracks.length > 0
  const file = multitrack
    ? audios.find((a) => a.id === mix.tracks[0])
    : (audios.find((a) => a.id === audioId) ?? defaultAudio(audios))
  if (!file) return null
  return {
    identity: `${multitrack ? 'mt' : 'a'}:${file.id}`,
    // áudio sem tom cadastrado = no tom original da música
    audioSemi: semitonesBetween(song.original_key, file.musical_key ?? song.original_key),
    multitrack,
  }
}

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
  const multitrack = useMultitrack()
  const storedMix = useMix(songId)
  const [audioId, setAudioId] = useState<string | null>(null)
  const canEditSong = !!song.data && can(song.data.ministry_id, 'songs')
  const doubleTap = useDoubleTap(() => {
    if (!canEditSong) return
    window.getSelection()?.removeAllRanges()
    navigate(`/repertorio/${songId}/editar`)
  })

  const accidentalsPref = useAccidentalsPref(songId)

  // Tom da cifra e do áudio andam juntos: com áudio, o tom da tela é o do
  // áudio + o que foi mudado no player; mudar a cifra muda o player. Ao abrir
  // (ou trocar de áudio) o player vai para o tom que a tela mostra.
  const linked = linkedAudio(song.data, files.data, storedMix, audioId)
  const shownSemi = useRef<number | null>(null)
  const syncedFor = useRef<string | null>(null)
  const linkedPlayer = linked?.multitrack ? multitrack : engine
  const shownNow = linked
    ? linked.audioSemi + linkedPlayer.semitones
    : (semi ?? semitonesBetween(song.data?.original_key, targetKey))
  useEffect(() => {
    shownSemi.current = shownNow
  }, [shownNow])
  useEffect(() => {
    if (!linked || syncedFor.current === linked.identity) return
    const first = syncedFor.current === null
    syncedFor.current = linked.identity
    const original = song.data?.original_key
    const wanted = first
      ? (semi ?? (targetKey ? semitonesBetween(original, targetKey) : null))
      : shownSemi.current
    if (wanted === null) return
    linkedPlayer.setSemitones(wanted - linked.audioSemi)
  }, [linked, linkedPlayer, semi, targetKey, song.data?.original_key])

  if (song.error) return <ErrorState error={song.error} onRetry={() => void song.refetch()} />
  if (song.isPending) return <FullScreenLoader />
  if (!song.data) return <ErrorState error="Música não encontrada." />

  const s = song.data
  const audios = (files.data ?? []).filter((f) => f.kind === 'audio') as AudioFile[]
  // abre no áudio padrão; trocar vale só para esta pessoa, agora
  const audio = audios.find((a) => a.id === audioId) ?? defaultAudio(audios)
  // Multitracks: faixas escolhidas no mixer tocando juntas (no lugar do áudio único)
  const mix = cleanMix(
    storedMix,
    audios.map((a) => a.id),
  )
  const multitrackOn = !!files.data && mix.active && mix.tracks.length > 0
  const player = multitrackOn ? multitrack : engine
  // sem áudio: a cifra parte do tom do culto (ou o original) e muda sozinha;
  // com áudio: tom do áudio + o que mudou no player (os dois juntos)
  const baseSemi = semitonesBetween(s.original_key, targetKey)
  const semitones = linked ? linked.audioSemi + player.semitones : (semi ?? baseSemi)
  // "voltar": ao tom do culto; sem culto, ao do áudio (ou o original)
  const resetSemi = targetKey ? baseSemi : linked ? linked.audioSemi : 0
  const changeKey = (delta: number) => {
    if (linked) player.setSemitones(player.semitones + delta)
    else setSemi(semitones + delta)
  }
  const openMixer = () => {
    engine.pause()
    if (opensInNewWindow() && openMixerWindow(s.id)) return
    multitrack.pause()
    navigate(mixerPath(s.id))
  }
  const links = songLinks(s.links)
  const transposedKey = s.original_key ? transposeKey(s.original_key, semitones) : null
  const accidentals = resolveAccidentals(accidentalsPref, transposedKey)
  // com A#/Bb escolhido à mão, o tom mostrado segue a mesma grafia
  const currentKey =
    transposedKey && accidentalsPref !== 'auto'
      ? spellChord(transposedKey, accidentalsPref)
      : transposedKey
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
        {multitrackOn && (
          <div className="mb-1 w-full">
            <MultitrackBar
              songId={s.id}
              mix={mix}
              files={audios}
              songBpm={s.bpm}
              songKey={s.original_key}
              beats={beatsPerBar(s.time_signature)}
              engine={multitrack}
              onOpenMixer={openMixer}
            />
          </div>
        )}
        {audio && !multitrackOn && (
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
                    .load(next.url, next.id, s.id)
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
        {!multitrackOn && audios.length >= 2 && (
          <Button
            variant="outline"
            size="sm"
            className="mb-1"
            onClick={() => {
              if (mix.tracks.length === 0) return openMixer()
              engine.pause()
              updateMix(s.id, (m) => ({ ...m, active: true }))
            }}
          >
            <Layers aria-hidden="true" />
            {mix.tracks.length
              ? `Multitracks · ${mix.tracks.length} faixas`
              : 'Multitracks: tocar várias faixas juntas'}
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="font-mono text-lg"
          aria-label="Baixar meio tom"
          onClick={() => changeKey(-1)}
        >
          −
        </Button>
        <div className="flex min-w-16 flex-col items-center">
          <span className="text-muted-foreground text-[11px]">TOM</span>
          <span className="text-primary font-mono text-xl font-semibold">{currentKey ?? '—'}</span>
          {linked && <span className="text-muted-foreground text-[10px]">cifra e áudio</span>}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="font-mono text-lg"
          aria-label="Subir meio tom"
          onClick={() => changeKey(1)}
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
              onClick={() => void copySheet(s.chordpro, semitones, lyricsOnly, accidentals)}
            >
              <Copy aria-hidden="true" />
              {lyricsOnly ? 'Copiar letra' : 'Copiar cifra'}
            </Button>
          </span>
          <NoteColorPicker />
          <AccidentalsPicker songId={s.id} />
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
          {semitones !== resetSemi && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                linked ? player.setSemitones(resetSemi - linked.audioSemi) : setSemi(null)
              }
            >
              Voltar ao tom {targetKey ? 'do culto' : linked ? 'do áudio' : 'original'}
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
            songKey={transposedKey}
            songId={s.id}
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

/** Sustenido ou bemol na cifra (A# ou Bb): escolha desta música, salva no aparelho. */
function AccidentalsPicker({ songId }: { songId: string }) {
  const current = useAccidentalsPref(songId)
  const [open, setOpen] = useState(false)
  const short = { auto: 'Auto', sharp: 'A#', flat: 'Bb' } as const
  return (
    <span className="flex flex-wrap items-center">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-label={open ? 'Fechar grafia dos acordes' : 'Escolher sustenido ou bemol'}
        title="Escolher como escrever os acordes desta música: A# ou Bb"
        onClick={() => setOpen((v) => !v)}
      >
        ♯/♭ <span className="text-muted-foreground">{short[current]}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </Button>
      {open && (
        <span role="radiogroup" aria-label="Sustenido ou bemol" className="flex gap-1">
          {ACCIDENTAL_OPTIONS.map((o) => (
            <Button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={current === o.id}
              variant={current === o.id ? 'secondary' : 'ghost'}
              size="sm"
              title={o.hint}
              onClick={() => {
                setAccidentalsPref(songId, o.id)
                setOpen(false)
              }}
            >
              {o.label}
            </Button>
          ))}
        </span>
      )}
    </span>
  )
}

async function copySheet(
  chordpro: string,
  semitones: number,
  lyricsOnly: boolean,
  accidentals: Accidentals | null,
) {
  try {
    const sections = readChordPro(chordpro, semitones, accidentals)
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
