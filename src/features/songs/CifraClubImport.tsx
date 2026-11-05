import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Download, ExternalLink, X } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { invokeFunction } from '@/lib/functions'

export type ImportedChords = {
  title: string | null
  artist: string | null
  /** tom real (o que a banda toca) */
  key: string | null
  /** casa do capotraste; os acordes de `text` estão na forma de `shapeKey` (versões antigas da função não mandam) */
  capo?: number | null
  shapeKey?: string | null
  text: string
  sourceUrl: string
}

// Mesmo endereço montado pela Edge Function (`_shared/import/cifraclub.ts`).
function cifraClubPageUrl(artist: string, title: string, link: string): string | null {
  const pasted = link.trim()
  if (/^https:\/\/(www\.|m\.)?cifraclub\.com\.br\//.test(pasted)) return pasted
  const slug = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/&/g, 'e')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  if (!slug(artist) || !slug(title)) return null
  return `https://www.cifraclub.com.br/${slug(artist)}/${slug(title)}/`
}

// Traz a cifra do Cifra Club (pela Edge Function import-cifra) para o
// editor; o líder revisa e ajusta antes de salvar.
export function CifraClubImport({
  ministryId,
  initialArtist,
  initialTitle,
  initialLink,
  collapsible = false,
  onImported,
}: {
  ministryId: string
  initialArtist?: string
  initialTitle?: string
  initialLink?: string
  // Música já salva: começa fechado (só o botão), para não ocupar a tela.
  collapsible?: boolean
  onImported: (result: ImportedChords) => void
}) {
  const [open, setOpen] = useState(!collapsible)
  const [artist, setArtist] = useState(initialArtist ?? '')
  const [title, setTitle] = useState(initialTitle ?? '')
  const [link, setLink] = useState(initialLink ?? '')
  const [error, setError] = useState<string | null>(null)

  const pageUrl = cifraClubPageUrl(artist, title, link)

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
      if (collapsible) setOpen(false)
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  })

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <Download aria-hidden="true" />
        Buscar cifra no Cifra Club
      </Button>
    )
  }

  return (
    <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-primary text-xs font-semibold tracking-wider">
            BUSCAR NO CIFRA CLUB
          </span>
          {collapsible && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Fechar busca no Cifra Club"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-[13px]">
          Trazemos a cifra para você revisar e editar aqui antes de salvar. Se a busca falhar, abra
          a música no Cifra Club, copie a cifra e cole no campo Cifra.
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
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={run.isPending}
          onClick={() => run.mutate()}
        >
          <Download aria-hidden="true" />
          {run.isPending ? 'Buscando…' : 'Trazer cifra'}
        </Button>
        {pageUrl && (
          <Button variant="ghost" asChild>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              Abrir no Cifra Club
            </a>
          </Button>
        )}
      </div>
    </section>
  )
}
