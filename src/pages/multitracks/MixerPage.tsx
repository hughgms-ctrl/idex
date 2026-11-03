import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Layers, Music2, Upload } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useChurch } from '@/features/church/church-context'
import { TrackToggle } from '@/features/multitracks/MultitrackBar'
import { cleanMix, MAX_VOLUME, toggleTrack, updateMix, useMix } from '@/features/multitracks/mix'
import { useSong } from '@/features/songs/queries'
import { useSongFiles } from '@/features/songs/song-files'
import { cn } from '@/lib/utils'

/**
 * Mixer do Multitracks (`/multitracks/:songId`): escolhe as faixas, volume,
 * mudo e solo. Pode abrir em outra janela (computador): o que muda aqui chega
 * na hora à janela da cifra.
 */
export function MixerPage() {
  const { songId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { can } = useChurch()
  const song = useSong(songId)
  const files = useSongFiles(songId)
  const stored = useMix(songId)
  const asWindow = params.get('janela') === '1' && !!window.opener

  if (song.error) return <ErrorState error={song.error} onRetry={() => void song.refetch()} />
  if (files.error) return <ErrorState error={files.error} onRetry={() => void files.refetch()} />
  if (song.isPending || files.isPending) return <FullScreenLoader />
  if (!song.data) return <ErrorState error="Música não encontrada." />

  const s = song.data
  const audios = files.data.filter((f) => f.kind === 'audio')
  const order = audios.map((a) => a.id)
  const mix = cleanMix(stored, order)
  const canUpload = can(s.ministry_id, 'song_files')
  const set = (change: Parameters<typeof updateMix>[1]) =>
    updateMix(songId, (m) => change(cleanMix(m, order)))

  const backToSheet = () => {
    set((m) => ({ ...m, active: m.tracks.length > 0 }))
    if (asWindow) {
      try {
        window.opener?.focus()
      } catch {
        // outra origem: só fecha
      }
      window.close()
      return
    }
    navigate(`/repertorio/${songId}`)
  }

  return (
    <div className="bg-background mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="flex items-center gap-2 px-3 pt-4 pb-2">
        {!asWindow && (
          <Button asChild variant="ghost" size="icon" aria-label="Voltar para a cifra">
            <Link to={`/repertorio/${songId}`}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-px px-2">
          <span className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-wider">
            <Layers className="size-3.5" aria-hidden="true" /> MULTITRACKS
          </span>
          <h1 className="truncate text-lg font-semibold">{s.title}</h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-4 pb-32">
        {audios.length === 0 ? (
          <div className="bg-card flex flex-col items-start gap-3 rounded-2xl border p-4 text-sm">
            <p>Esta música ainda não tem faixas.</p>
            {canUpload && (
              <Button asChild variant="secondary">
                <Link to={`/repertorio/${songId}/audios`}>
                  <Upload aria-hidden="true" /> Enviar faixas
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground flex-1 text-[13px]">
                Escolha as faixas que vão tocar juntas. Tom e andamento mudam para todas ao mesmo
                tempo, na tela da cifra.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set((m) => ({ ...m, tracks: order }))}
              >
                Todas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set((m) => ({ ...m, tracks: [], solo: {} }))}
              >
                Nenhuma
              </Button>
            </div>

            <ul className="flex flex-col gap-2">
              {audios.map((a) => {
                const on = mix.tracks.includes(a.id)
                const volume = Math.round((mix.volume[a.id] ?? 1) * 100)
                return (
                  <li
                    key={a.id}
                    className={cn(
                      'bg-card flex flex-col gap-2 rounded-2xl border p-3',
                      on && 'border-primary/60',
                    )}
                  >
                    <label className="flex min-h-11 items-center gap-3">
                      <Music2
                        className={cn(
                          'size-4 shrink-0',
                          on ? 'text-primary' : 'text-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{a.name}</span>
                        {(a.musical_key || a.bpm) && (
                          <span className="text-muted-foreground font-mono text-xs">
                            {[a.musical_key, a.bpm ? `${a.bpm} BPM` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                      <Switch
                        checked={on}
                        aria-label={`Tocar ${a.name}`}
                        onCheckedChange={() => set((m) => toggleTrack(m, a.id, order))}
                      />
                    </label>
                    {on && (
                      <div className="flex items-center gap-2">
                        <TrackToggle
                          large
                          label="M"
                          title={`Mudo: ${a.name}`}
                          on={!!mix.muted[a.id]}
                          tone="mute"
                          onClick={() =>
                            set((m) => ({ ...m, muted: { ...m.muted, [a.id]: !m.muted[a.id] } }))
                          }
                        />
                        <TrackToggle
                          large
                          label="S"
                          title={`Solo: ${a.name}`}
                          on={!!mix.solo[a.id]}
                          tone="solo"
                          onClick={() =>
                            set((m) => ({ ...m, solo: { ...m.solo, [a.id]: !m.solo[a.id] } }))
                          }
                        />
                        <input
                          type="range"
                          aria-label={`Volume de ${a.name}`}
                          min={0}
                          max={MAX_VOLUME * 100}
                          step={5}
                          value={volume}
                          onChange={(e) =>
                            set((m) => ({
                              ...m,
                              volume: { ...m.volume, [a.id]: Number(e.target.value) / 100 },
                            }))
                          }
                          onDoubleClick={() =>
                            set((m) => ({ ...m, volume: { ...m.volume, [a.id]: 1 } }))
                          }
                          className="accent-primary h-11 min-w-0 flex-1"
                        />
                        <span className="text-muted-foreground w-11 text-right font-mono text-xs">
                          {volume}%
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            <p className="text-muted-foreground text-[11px]">
              As faixas ficam abertas na memória do aparelho: no celular, prefira até 8. A mixagem é
              só sua e fica salva neste aparelho. Toque duas vezes no volume para voltar a 100%.
            </p>
            {canUpload && (
              <Button asChild variant="ghost" className="self-start">
                <Link to={`/repertorio/${songId}/audios`}>
                  <Upload aria-hidden="true" /> Enviar ou renomear faixas
                </Link>
              </Button>
            )}
          </>
        )}
      </main>

      <footer className="bg-background/95 fixed inset-x-0 bottom-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <span className="text-muted-foreground flex-1 text-sm">
            {mix.tracks.length} {mix.tracks.length === 1 ? 'faixa' : 'faixas'}
          </span>
          <Button disabled={mix.tracks.length === 0} onClick={backToSheet}>
            Tocar com a cifra
          </Button>
        </div>
      </footer>
    </div>
  )
}
