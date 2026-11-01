import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Music2,
  Pause,
  Play,
  Settings2,
  Timer,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { effectiveBpm, formatClock, rateForBpm } from '@/features/songs/audio-math'
import { useAudioEngine } from '@/features/songs/useAudioEngine'
import { transposeKey } from '@/lib/music'
import { cn } from '@/lib/utils'

export type AudioFile = {
  id: string
  name: string
  storage_path: string
  storage_backend: string
  url: string | null
  bpm: number | null
  musical_key: string | null
  is_default?: boolean
}

type Engine = ReturnType<typeof useAudioEngine>

/**
 * Player do áudio de referência. `compact`: uma linha (fica no topo da cifra);
 * tom, andamento e metrônomo abrem em "Ajustes".
 */
export function AudioPlayer({
  file,
  songBpm,
  songKey,
  beats,
  engine,
  compact = false,
  files,
  onSelect,
  manageHref,
}: {
  file: AudioFile
  songBpm: number | null
  songKey: string | null
  beats: number
  engine: Engine
  compact?: boolean
  /** Outros áudios da música (troca pelo seletor). */
  files?: AudioFile[]
  onSelect?: (file: AudioFile) => void
  manageHref?: string
}) {
  const baseBpm = file.bpm ?? songBpm ?? null
  const baseKey = file.musical_key ?? songKey ?? null
  const [manualBpm, setManualBpm] = useState(baseBpm ?? 80)
  const [open, setOpen] = useState(!compact)
  const [choosing, setChoosing] = useState(false)
  const bpm = baseBpm ?? manualBpm
  const { setTempo } = engine

  useEffect(() => {
    setTempo(bpm, beats)
  }, [bpm, beats, setTempo])

  const loaded = engine.loadedKey === file.id
  const shownKey = baseKey ? transposeKey(baseKey, engine.semitones) : null
  const semisLabel =
    engine.semitones === 0 ? 'original' : `${engine.semitones > 0 ? '+' : ''}${engine.semitones}`

  const toggle = async () => {
    if (engine.playing) return engine.pause()
    if (!loaded) {
      if (!file.url || !(await engine.load(file.url, file.id))) return
    }
    await engine.play()
  }

  const adjusted = engine.semitones !== 0 || engine.rate !== 1
  const status = engine.loading
    ? 'Carregando áudio…'
    : engine.preparing
      ? 'Preparando tom/andamento…'
      : null

  return (
    <section
      aria-label="Player"
      className={cn(
        'bg-card flex flex-col rounded-[20px] border',
        compact ? 'gap-3 p-2.5' : 'sticky top-2 z-20 gap-4 p-4',
      )}
    >
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          className={cn('shrink-0 rounded-full', compact ? 'size-12' : 'size-14')}
          aria-label={engine.playing ? 'Pausar' : 'Tocar'}
          disabled={engine.loading || !file.url}
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
          {files && files.length > 1 && onSelect ? (
            <button
              type="button"
              aria-expanded={choosing}
              onClick={() => setChoosing((v) => !v)}
              className="flex min-w-0 items-center gap-1.5 text-left"
            >
              <span className="truncate text-[15px] font-semibold">{file.name}</span>
              <span className="text-primary flex shrink-0 items-center text-xs font-medium">
                {files.length} áudios
                <ChevronDown
                  className={cn('size-4 transition-transform', choosing && 'rotate-180')}
                  aria-hidden="true"
                />
              </span>
            </button>
          ) : (
            <span className="truncate text-[15px] font-semibold">{file.name}</span>
          )}
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
                {!status && compact && adjusted && (
                  <span className="text-primary truncate">
                    {shownKey ?? semisLabel} · {effectiveBpm(bpm, engine.rate)} BPM
                  </span>
                )}
              </span>
            </>
          )}
        </div>
        {compact && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? 'Fechar ajustes do áudio' : 'Tom, andamento e metrônomo'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="size-5" /> : <Settings2 className="size-5" />}
          </Button>
        )}
      </div>

      {choosing && files && onSelect && (
        <ul aria-label="Escolha o áudio" className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => {
                  setChoosing(false)
                  if (f.id !== file.id) onSelect(f)
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm',
                  f.id === file.id && 'border-primary text-primary',
                )}
              >
                <Music2 className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                {f.is_default && (
                  <span className="text-muted-foreground shrink-0 text-[11px] font-semibold tracking-wider">
                    PADRÃO
                  </span>
                )}
              </button>
            </li>
          ))}
          <li className="text-muted-foreground px-1 text-[11px]">
            A troca vale só para você, agora. Para os outros continua o áudio padrão.
          </li>
        </ul>
      )}

      {engine.error && file.url && (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <span className="text-muted-foreground text-xs">
            Ouça sem mudar tom e andamento enquanto isso:
          </span>
          <audio controls preload="metadata" src={file.url} className="w-full" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void engine.load(file.url ?? '', file.id)}
          >
            Tentar abrir no player de novo
          </Button>
        </div>
      )}

      {open && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-1 rounded-xl border p-2">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wider">
                TOM
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Baixar meio tom do áudio"
                  onClick={() => engine.setSemitones(engine.semitones - 1)}
                >
                  −
                </Button>
                <span className="text-primary min-w-10 text-center font-mono text-xl font-semibold">
                  {shownKey ?? semisLabel}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Subir meio tom do áudio"
                  onClick={() => engine.setSemitones(engine.semitones + 1)}
                >
                  +
                </Button>
              </div>
              <span className="text-muted-foreground text-[11px]">
                {shownKey ? semisLabel : 'meio tons'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1 rounded-xl border p-2">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wider">
                ANDAMENTO
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Mais devagar"
                  onClick={() =>
                    engine.setRate(rateForBpm(bpm, effectiveBpm(bpm, engine.rate) - 2))
                  }
                >
                  −
                </Button>
                <span className="min-w-10 text-center font-mono text-xl font-semibold">
                  {effectiveBpm(bpm, engine.rate)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Mais rápido"
                  onClick={() =>
                    engine.setRate(rateForBpm(bpm, effectiveBpm(bpm, engine.rate) + 2))
                  }
                >
                  +
                </Button>
              </div>
              <span className="text-muted-foreground text-[11px]">
                BPM · {Math.round(engine.rate * 100)}%
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={engine.metronome ? 'default' : 'outline'}
              aria-pressed={engine.metronome}
              onClick={() => void engine.setMetronome(!engine.metronome)}
            >
              <Timer aria-hidden="true" /> Metrônomo {engine.metronome ? 'ligado' : 'desligado'}
            </Button>
            {!baseBpm && (
              <label className="text-muted-foreground flex items-center gap-2 text-xs">
                BPM
                <Input
                  type="number"
                  min={20}
                  max={300}
                  className="h-11 w-20"
                  value={manualBpm}
                  onChange={(e) =>
                    setManualBpm(Math.max(20, Math.min(300, Number(e.target.value) || 80)))
                  }
                />
              </label>
            )}
            {adjusted && (
              <Button
                variant="ghost"
                onClick={() => {
                  engine.setSemitones(0)
                  engine.setRate(1)
                }}
              >
                Voltar ao original
              </Button>
            )}
            {manageHref && (
              <Button asChild variant="ghost" className="ml-auto">
                <Link to={manageHref}>Gerenciar áudios</Link>
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-[11px]">
            No tom e andamento originais o áudio toca sem nenhum processamento. Ao mudar, o som
            passa por um processador de alta qualidade (o mesmo tipo usado em estúdio).
          </p>
        </>
      )}
    </section>
  )
}
