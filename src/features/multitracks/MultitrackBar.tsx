import { useEffect, useMemo, useState } from 'react'
import { ChevronUp, Layers, Loader2, Pause, Play, Settings2, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { trackGain, updateMix, type Mix } from '@/features/multitracks/mix'
import type { useMultitrack } from '@/features/multitracks/useMultitrack'
import type { AudioFile } from '@/features/songs/AudioPlayer'
import { PlayerAdjustments } from '@/features/songs/PlayerAdjustments'
import { effectiveBpm, formatClock } from '@/features/songs/audio-math'
import { transposeKey } from '@/lib/music'
import { cn } from '@/lib/utils'

type Engine = ReturnType<typeof useMultitrack>

/**
 * Multitracks em cima da cifra: as faixas escolhidas no mixer tocam juntas,
 * com um tom e um andamento para todas. Mudo/solo aqui; volume no mixer.
 */
export function MultitrackBar({
  songId,
  mix,
  files,
  songBpm,
  songKey,
  beats,
  engine,
  onOpenMixer,
}: {
  songId: string
  mix: Mix
  files: AudioFile[]
  songBpm: number | null
  songKey: string | null
  beats: number
  engine: Engine
  onOpenMixer: () => void
}) {
  const tracks = useMemo(
    () => mix.tracks.map((id) => files.find((f) => f.id === id)).filter((f): f is AudioFile => !!f),
    [mix.tracks, files],
  )
  const setKey = tracks.map((t) => t.id).join(',')
  const first = tracks[0]
  const baseBpm = tracks.find((t) => t.bpm)?.bpm ?? songBpm ?? null
  const baseKey = first?.musical_key ?? songKey ?? null
  const [manualBpm, setManualBpm] = useState(baseBpm ?? 80)
  const [open, setOpen] = useState(false)
  const bpm = baseBpm ?? manualBpm
  const { setTempo, setGains, load, play, loadedKey, playing } = engine

  useEffect(() => {
    setTempo(bpm, beats)
  }, [bpm, beats, setTempo])

  // volume/mudo/solo (também quando mudam na janela do mixer)
  const gains = useMemo(
    () => Object.fromEntries(mix.tracks.map((id) => [id, trackGain(mix, id)])),
    [mix],
  )
  useEffect(() => {
    setGains(gains)
  }, [gains, setGains])

  const sources = () =>
    tracks.filter((t) => t.url).map((t) => ({ id: t.id, url: t.url as string, name: t.name }))

  // faixas trocadas no mixer com a música tocando: reabre e continua
  useEffect(() => {
    if (!loadedKey || loadedKey === setKey || !playing || !setKey) return
    void load(sources(), gains, setKey).then((ok) => (ok ? play() : undefined))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey])

  const loaded = loadedKey === setKey
  const missing = tracks.some((t) => !t.url)

  const toggle = async () => {
    if (engine.playing) return engine.pause()
    if (!loaded && !(await load(sources(), gains, setKey))) return
    await play()
  }

  const shownKey = baseKey ? transposeKey(baseKey, engine.semitones) : null
  const adjusted = engine.semitones !== 0 || engine.rate !== 1
  const status = engine.progress
    ? `Abrindo faixa ${Math.min(engine.progress.done + 1, engine.progress.total)} de ${engine.progress.total}…`
    : null

  const flip = (field: 'muted' | 'solo', id: string) =>
    updateMix(songId, (m) => ({ ...m, [field]: { ...m[field], [id]: !m[field][id] } }))

  return (
    <section
      aria-label="Multitracks"
      className="bg-card flex flex-col gap-3 rounded-[20px] border p-2.5"
    >
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          className="size-12 shrink-0 rounded-full"
          aria-label={engine.playing ? 'Pausar' : 'Tocar as faixas'}
          disabled={engine.loading || tracks.length === 0 || missing}
          onClick={() => void toggle()}
        >
          {engine.loading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : engine.playing ? (
            <Pause className="size-6" />
          ) : (
            <Play className="size-6" />
          )}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold">
            <Layers className="text-primary size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Multitracks · {tracks.length} faixas</span>
          </span>
          {engine.error ? (
            <span className="text-destructive text-xs">{engine.error}</span>
          ) : (
            <>
              <input
                type="range"
                aria-label="Posição"
                min={0}
                max={Math.max(1, loaded ? engine.duration : 1)}
                step={0.5}
                value={loaded ? engine.position : 0}
                disabled={!loaded}
                onChange={(e) => void engine.seek(Number(e.target.value))}
                className="accent-primary w-full"
              />
              <span className="text-muted-foreground flex justify-between gap-2 font-mono text-xs">
                <span>
                  {formatClock(loaded ? engine.position : 0)} /{' '}
                  {loaded ? formatClock(engine.duration) : '—'}
                </span>
                {status && <span className="truncate font-sans">{status}</span>}
                {!status && adjusted && (
                  <span className="text-primary truncate">
                    {shownKey ?? engine.semitones} · {effectiveBpm(bpm, engine.rate)} BPM
                  </span>
                )}
              </span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={open ? 'Fechar ajustes' : 'Tom, andamento e metrônomo'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronUp className="size-5" /> : <Settings2 className="size-5" />}
        </Button>
      </div>

      {missing && (
        <p className="text-destructive text-xs">
          Alguma faixa não está disponível agora. Abra o mixer e confira.
        </p>
      )}

      <ul aria-label="Faixas tocando" className="flex gap-1.5 overflow-x-auto pb-0.5">
        {tracks.map((t) => {
          const silent = trackGain(mix, t.id) === 0
          return (
            <li
              key={t.id}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-xl border py-1 pr-1 pl-2.5',
                silent && 'opacity-50',
              )}
            >
              <span className="max-w-28 truncate text-xs font-medium">{t.name}</span>
              <TrackToggle
                label="M"
                title={`Mudo: ${t.name}`}
                on={!!mix.muted[t.id]}
                tone="mute"
                onClick={() => flip('muted', t.id)}
              />
              <TrackToggle
                label="S"
                title={`Solo: ${t.name}`}
                on={!!mix.solo[t.id]}
                tone="solo"
                onClick={() => flip('solo', t.id)}
              />
            </li>
          )
        })}
      </ul>

      {open && (
        <PlayerAdjustments
          engine={engine}
          bpm={bpm}
          shownKey={shownKey}
          manualBpm={baseBpm ? null : manualBpm}
          onManualBpm={setManualBpm}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onOpenMixer}>
          <SlidersHorizontal aria-hidden="true" /> Mixer e faixas
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            engine.pause()
            updateMix(songId, (m) => ({ ...m, active: false }))
          }}
        >
          Voltar ao áudio único
        </Button>
      </div>
    </section>
  )
}

export function TrackToggle({
  label,
  title,
  on,
  tone,
  onClick,
  large = false,
}: {
  label: string
  title: string
  on: boolean
  tone: 'mute' | 'solo'
  onClick: () => void
  large?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={title}
      title={title}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-lg border font-mono font-bold',
        large ? 'size-11 text-sm' : 'size-8 text-[11px]',
        on
          ? tone === 'mute'
            ? 'border-destructive bg-destructive/20 text-destructive'
            : 'border-warning bg-warning/20 text-warning'
          : 'text-muted-foreground',
      )}
    >
      {label}
    </button>
  )
}
