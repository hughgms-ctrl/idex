import { useState } from 'react'
import { toast } from 'sonner'
import { HardDriveDownload, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { deleteCached, sizeMb, useCachedSongs } from '@/features/multitracks/track-cache'

/** Faixas guardadas neste aparelho, por música, com "Apagar". */
export function CachedTracks({ titles }: { titles: Record<string, string> }) {
  const { songs, supported } = useCachedSongs()
  const [busy, setBusy] = useState(false)
  if (!supported || !songs || songs.length === 0) return null
  const total = songs.reduce((n, s) => n + s.bytes, 0)

  const remove = async (songId?: string) => {
    setBusy(true)
    try {
      await deleteCached(songId)
      toast.success(songId ? 'Faixas apagadas deste aparelho' : 'Tudo apagado deste aparelho')
    } catch {
      toast.error('Não foi possível apagar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-muted-foreground flex-1 text-xs font-semibold tracking-wider">
          BAIXADAS NESTE APARELHO · {sizeMb(total)}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Apagar todas as faixas baixadas neste aparelho?')) void remove()
          }}
        >
          Apagar tudo
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Abrem sem internet e sem baixar de novo. Ficam guardadas até você apagar.
      </p>
      <ul className="flex flex-col gap-1.5">
        {songs.map((s) => (
          <li
            key={s.songId}
            className="flex min-h-11 items-center gap-2 rounded-xl border py-1 pr-1 pl-3 text-sm"
          >
            <HardDriveDownload className="text-primary size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {titles[s.songId] ?? 'Música apagada ou de outro ministério'}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {s.tracks} faixas · {sizeMb(s.bytes)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Apagar faixas de ${titles[s.songId] ?? 'música'} deste aparelho`}
              disabled={busy}
              onClick={() => void remove(s.songId)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Uma linha para a tela do mixer: "Baixadas neste aparelho · 120 MB · Apagar". */
export function CachedSongLine({ songId }: { songId: string }) {
  const { songs, supported } = useCachedSongs()
  const row = songs?.find((s) => s.songId === songId)
  if (!supported || !row) return null
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-[11px]">
      <HardDriveDownload className="size-3.5" aria-hidden="true" />
      {row.tracks} faixas baixadas neste aparelho · {sizeMb(row.bytes)}
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 text-[11px]"
        onClick={() => {
          void deleteCached(songId).then(() => toast.success('Faixas apagadas deste aparelho'))
        }}
      >
        Apagar
      </Button>
    </p>
  )
}
