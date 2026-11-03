import type { ReactNode } from 'react'
import { Timer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { effectiveBpm, rateForBpm } from '@/features/songs/audio-math'

/** O que os dois players (áudio único e Multitracks) têm em comum. */
export type AdjustableEngine = {
  semitones: number
  rate: number
  metronome: boolean
  setSemitones: (value: number) => void
  setRate: (value: number) => void
  setMetronome: (on: boolean) => Promise<void> | void
}

/** Tom, andamento e metrônomo do player. `manualBpm`: só quando a música não tem BPM. */
export function PlayerAdjustments({
  engine,
  bpm,
  shownKey,
  manualBpm,
  onManualBpm,
  extra,
}: {
  engine: AdjustableEngine
  bpm: number
  shownKey: string | null
  manualBpm: number | null
  onManualBpm: (bpm: number) => void
  extra?: ReactNode
}) {
  const adjusted = engine.semitones !== 0 || engine.rate !== 1
  const semisLabel =
    engine.semitones === 0 ? 'original' : `${engine.semitones > 0 ? '+' : ''}${engine.semitones}`
  return (
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
              onClick={() => engine.setRate(rateForBpm(bpm, effectiveBpm(bpm, engine.rate) - 2))}
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
              onClick={() => engine.setRate(rateForBpm(bpm, effectiveBpm(bpm, engine.rate) + 2))}
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
        {manualBpm !== null && (
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            BPM
            <Input
              type="number"
              min={20}
              max={300}
              className="h-11 w-20"
              value={manualBpm}
              onChange={(e) =>
                onManualBpm(Math.max(20, Math.min(300, Number(e.target.value) || 80)))
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
        {extra}
      </div>
    </>
  )
}
