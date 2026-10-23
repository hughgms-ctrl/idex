import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invokeFunction } from '@/lib/functions'

export type ImportedChords = {
  title: string | null
  artist: string | null
  key: string | null
  text: string
  sourceUrl: string
}

// Traz a cifra do Cifra Club (pela Edge Function import-cifra) para o
// editor; o líder revisa e ajusta antes de salvar.
export function CifraClubImport({
  ministryId,
  initialArtist,
  initialTitle,
  onImported,
}: {
  ministryId: string
  initialArtist?: string
  initialTitle?: string
  onImported: (result: ImportedChords) => void
}) {
  const [artist, setArtist] = useState(initialArtist ?? '')
  const [title, setTitle] = useState(initialTitle ?? '')
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async () => {
      const body = link.trim()
        ? { ministryId, url: link.trim() }
        : { ministryId, artist: artist.trim(), title: title.trim() }
      if (!('url' in body) && (!body.artist || !body.title)) {
        throw new Error('Informe o artista e o nome da música, ou cole o link.')
      }
      return invokeFunction<ImportedChords>('import-cifra', body)
    },
    onSuccess: (data) => {
      setError(null)
      onImported(data)
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  })

  return (
    <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-col gap-1">
        <span className="text-primary text-xs font-semibold tracking-wider">
          BUSCAR NO CIFRA CLUB
        </span>
        <p className="text-muted-foreground text-[13px]">
          Trazemos a cifra para você revisar e editar aqui antes de salvar.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField id="cc-artist" label="Artista">
          <Input id="cc-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </FormField>
        <FormField id="cc-title" label="Música">
          <Input id="cc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
      </div>
      <FormField id="cc-link" label="Ou cole o link da cifra (opcional)">
        <Input
          id="cc-link"
          type="url"
          inputMode="url"
          placeholder="https://www.cifraclub.com.br/artista/musica/"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </FormField>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={run.isPending}
        onClick={() => run.mutate()}
      >
        <Download aria-hidden="true" />
        {run.isPending ? 'Buscando…' : 'Trazer cifra'}
      </Button>
    </section>
  )
}
