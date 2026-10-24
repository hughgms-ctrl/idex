import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Music2, Pause, Pencil, Play, Timer, Trash2, Upload } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useChurch } from '@/features/church/church-context'
import { beatsPerBar, effectiveBpm, formatClock, rateForBpm } from '@/features/songs/audio-math'
import { BUCKET, songFileKeys, uploadSongFile, useSongFiles } from '@/features/songs/song-files'
import { useSong } from '@/features/songs/queries'
import { useAudioEngine } from '@/features/songs/useAudioEngine'
import { errorMessage } from '@/lib/errors'
import { KEY_OPTIONS, transposeKey } from '@/lib/music'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type AudioFile = {
  id: string
  name: string
  storage_path: string
  url: string | null
  bpm: number | null
  musical_key: string | null
}

// Áudios de referência da música: cada um com nome, BPM e tom. O player muda
// o tom e o andamento e toca o metrônomo junto.
export function AudiosPage() {
  const { songId = '' } = useParams()
  const { isLeader } = useChurch()
  const song = useSong(songId)
  const files = useSongFiles(songId)
  const engine = useAudioEngine()
  const [selected, setSelected] = useState<AudioFile | null>(null)

  if (song.error || files.error) return <ErrorState error={song.error ?? files.error} />
  if (song.isPending || files.isPending) return <FullScreenLoader />
  if (!song.data) return <ErrorState error="Música não encontrada." />

  const s = song.data
  const canEdit = isLeader(s.ministry_id)
  const audios = (files.data ?? []).filter((f) => f.kind === 'audio') as AudioFile[]
  const current = selected ? (audios.find((a) => a.id === selected.id) ?? selected) : null

  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link to={`/repertorio/${s.id}`}>
          <ArrowLeft aria-hidden="true" /> {s.title}
        </Link>
      </Button>
      <PageHeader
        eyebrow="ÁUDIOS"
        title={s.title}
        description="Ouça sua parte no tom que precisar, mude o andamento e ligue o metrônomo."
      />

      {current && (
        <Player
          key={current.id}
          file={current}
          songBpm={s.bpm}
          songKey={s.original_key}
          beats={beatsPerBar(s.time_signature)}
          engine={engine}
        />
      )}

      <section className="flex flex-col gap-2">
        {audios.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {canEdit
              ? 'Nenhum áudio ainda. Envie o primeiro abaixo.'
              : 'Nenhum áudio ainda. O líder envia por aqui.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {audios.map((a) => (
              <AudioRow
                key={a.id}
                file={a}
                songId={s.id}
                active={current?.id === a.id}
                canEdit={canEdit}
                onSelect={() => {
                  setSelected(a)
                  if (a.url && engine.url !== a.url) void engine.load(a.url)
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <UploadAudio
          churchId={s.church_id}
          songId={s.id}
          defaultBpm={s.bpm}
          defaultKey={s.original_key}
        />
      )}
    </>
  )
}

function Player({
  file,
  songBpm,
  songKey,
  beats,
  engine,
}: {
  file: AudioFile
  songBpm: number | null
  songKey: string | null
  beats: number
  engine: ReturnType<typeof useAudioEngine>
}) {
  const baseBpm = file.bpm ?? songBpm ?? null
  const baseKey = file.musical_key ?? songKey ?? null
  const [manualBpm, setManualBpm] = useState(baseBpm ?? 80)
  const bpm = baseBpm ?? manualBpm
  const { setTempo } = engine

  useEffect(() => {
    setTempo(bpm, beats)
  }, [bpm, beats, setTempo])

  const shownKey = baseKey ? transposeKey(baseKey, engine.semitones) : null
  const semisLabel =
    engine.semitones === 0 ? 'original' : `${engine.semitones > 0 ? '+' : ''}${engine.semitones}`

  return (
    <section
      aria-label="Player"
      className="bg-card sticky top-2 z-20 flex flex-col gap-4 rounded-[20px] border p-4"
    >
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          className="size-14 shrink-0 rounded-full"
          aria-label={engine.playing ? 'Pausar' : 'Tocar'}
          disabled={engine.loading || !engine.url}
          onClick={() => (engine.playing ? engine.pause() : void engine.play())}
        >
          {engine.playing ? <Pause className="size-6" /> : <Play className="size-6" />}
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold">{file.name}</span>
          {engine.loading ? (
            <span className="text-muted-foreground text-xs">Carregando áudio…</span>
          ) : engine.error ? (
            <span className="text-destructive text-xs">{engine.error}</span>
          ) : (
            <>
              <input
                type="range"
                aria-label="Posição"
                min={0}
                max={Math.max(1, engine.duration)}
                step={0.5}
                value={engine.position}
                onChange={(e) => engine.seek(Number(e.target.value))}
                className="accent-primary w-full"
              />
              <span className="text-muted-foreground font-mono text-xs">
                {formatClock(engine.position)} / {formatClock(engine.duration)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-xl border p-2">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-wider">
            TOM
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Baixar meio tom"
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
              aria-label="Subir meio tom"
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
        {(engine.semitones !== 0 || engine.rate !== 1) && (
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
      </div>
      <p className="text-muted-foreground text-[11px]">
        Use fone de ouvido. Mudanças grandes de tom deixam o som um pouco “metálico”.
      </p>
    </section>
  )
}

function AudioRow({
  file,
  songId,
  active,
  canEdit,
  onSelect,
}: {
  file: AudioFile
  songId: string
  active: boolean
  canEdit: boolean
  onSelect: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(file.name)
  const [bpm, setBpm] = useState(file.bpm ? String(file.bpm) : '')
  const [key, setKey] = useState(file.musical_key ?? '')
  const invalidate = () => queryClient.invalidateQueries({ queryKey: songFileKeys.list(songId) })

  const save = useMutation({
    mutationFn: async () => {
      const n = name.trim()
      if (!n) throw new Error('Dê um nome ao áudio')
      const b = bpm ? Number(bpm) : null
      if (b !== null && (!Number.isInteger(b) || b < 20 || b > 300)) {
        throw new Error('BPM entre 20 e 300')
      }
      const { error } = await supabase
        .from('song_files')
        .update({ name: n.slice(0, 200), bpm: b, musical_key: key || null })
        .eq('id', file.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setEditing(false)
      await invalidate()
      toast.success('Áudio atualizado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.storage.from(BUCKET).remove([file.storage_path])
      if (error) throw error
      const { error: err } = await supabase.from('song_files').delete().eq('id', file.id)
      if (err) throw err
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (editing) {
    return (
      <li className="bg-card flex flex-col gap-3 rounded-2xl border p-3.5">
        <FormField id={`n-${file.id}`} label="Nome">
          <Input id={`n-${file.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id={`b-${file.id}`} label="BPM">
            <Input
              id={`b-${file.id}`}
              type="number"
              inputMode="numeric"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
            />
          </FormField>
          <FormField id={`k-${file.id}`} label="Tom">
            <NativeSelect id={`k-${file.id}`} value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">—</option>
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Salvar
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li
      className={cn(
        'bg-card flex items-center gap-2 rounded-2xl border p-2 pl-3.5',
        active && 'border-primary',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Music2 className="text-primary size-5 shrink-0" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-medium">{file.name}</span>
          <span className="text-muted-foreground text-xs">
            {[file.musical_key && `Tom ${file.musical_key}`, file.bpm && `${file.bpm} BPM`]
              .filter(Boolean)
              .join(' · ') || 'Toque para ouvir'}
          </span>
        </span>
      </button>
      {canEdit && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Renomear ${file.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Apagar ${file.name}`}
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Apagar "${file.name}"?`)) remove.mutate()
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
    </li>
  )
}

function UploadAudio({
  churchId,
  songId,
  defaultBpm,
  defaultKey,
}: {
  churchId: string
  songId: string
  defaultBpm: number | null
  defaultKey: string | null
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [bpm, setBpm] = useState(defaultBpm ? String(defaultBpm) : '')
  const [key, setKey] = useState(defaultKey ?? '')

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Escolha o arquivo de áudio')
      if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(file.name)) {
        throw new Error('Escolha um arquivo de áudio (MP3, M4A, WAV…)')
      }
      const b = bpm ? Number(bpm) : null
      if (b !== null && (!Number.isInteger(b) || b < 20 || b > 300)) {
        throw new Error('BPM entre 20 e 300')
      }
      await uploadSongFile({ churchId, songId, file, name, bpm: b, musicalKey: key || null })
    },
    onSuccess: async () => {
      setFile(null)
      setName('')
      await queryClient.invalidateQueries({ queryKey: songFileKeys.list(songId) })
      toast.success('Áudio enviado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-dashed p-4">
      <h2 className="text-[15px] font-semibold">Enviar áudio</h2>
      <p className="text-muted-foreground text-[13px]">
        MP3, M4A, AAC, WAV, OGG ou FLAC, até 50 MB. Prefira <strong>MP3</strong>: uma música inteira
        cabe com folga (WAV ocupa cerca de 10 MB por minuto).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          e.target.value = ''
          setFile(f)
          if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
        }}
      />
      <Button variant="outline" className="self-start" onClick={() => inputRef.current?.click()}>
        <Upload aria-hidden="true" /> {file ? file.name : 'Escolher arquivo'}
      </Button>
      <FormField id="up-name" label="Nome (ex.: Voz tenor, Guia completo)">
        <Input id="up-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="up-bpm" label="BPM">
          <Input
            id="up-bpm"
            type="number"
            inputMode="numeric"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
          />
        </FormField>
        <FormField id="up-key" label="Tom do áudio">
          <NativeSelect id="up-key" value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">—</option>
            {KEY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <Button
        className="self-start"
        disabled={upload.isPending || !file}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? 'Enviando…' : 'Enviar áudio'}
      </Button>
    </section>
  )
}
