import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from 'react-router'
import { FileText, Headphones, Image, Paperclip, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  deleteSongFile,
  sizeLabel,
  songFileKeys,
  uploadSongFile,
  useSongFiles,
  type StoredFile,
} from '@/features/songs/song-files'
import { errorMessage } from '@/lib/errors'

// Áudios de referência, PDFs e imagens da música. Todos ouvem; o líder envia.
export function SongFiles({
  songId,
  churchId,
  canEdit,
}: {
  songId: string
  churchId: string
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const files = useSongFiles(songId)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: songFileKeys.list(songId) })

  const upload = useMutation({
    mutationFn: async (list: File[]) => {
      for (const file of list) await uploadSongFile({ churchId, songId, file })
      return list.length
    },
    onSuccess: async (n) => {
      await invalidate()
      toast.success(n === 1 ? 'Arquivo enviado' : `${n} arquivos enviados`)
    },
    onError: async (err) => {
      await invalidate()
      toast.error(errorMessage(err))
    },
  })

  const remove = useMutation({
    mutationFn: async (file: StoredFile) => {
      await deleteSongFile(file)
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const all = files.data ?? []
  const audios = all.filter((f) => f.kind === 'audio')
  const list = all.filter((f) => f.kind !== 'audio')

  return (
    <section aria-label="Áudios e arquivos" className="flex flex-col gap-2.5">
      <Button asChild variant="outline" className="min-h-12 justify-between rounded-2xl">
        <Link to={`/repertorio/${songId}/audios`}>
          <span className="flex items-center gap-2">
            <Headphones className="text-primary size-4" aria-hidden="true" />
            Áudios {audios.length > 0 && `(${audios.length})`}
          </span>
          <span className="text-muted-foreground text-xs">tom, andamento e metrônomo ›</span>
        </Link>
      </Button>

      {(canEdit || list.length > 0) && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Paperclip className="text-primary size-4" aria-hidden="true" /> Partituras e imagens
          </h2>
          {canEdit && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const chosen = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  if (chosen.length) upload.mutate(chosen)
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={upload.isPending}
                onClick={() => inputRef.current?.click()}
              >
                <Upload aria-hidden="true" /> {upload.isPending ? 'Enviando…' : 'Enviar'}
              </Button>
            </>
          )}
        </div>
      )}
      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((f) => (
            <li key={f.id} className="bg-card flex items-center gap-2 rounded-2xl border p-3">
              {f.kind === 'image' ? (
                <Image className="text-primary size-4 shrink-0" aria-hidden="true" />
              ) : (
                <FileText className="text-primary size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                {sizeLabel(f.size_bytes)}
              </span>
              {f.url && (
                <Button asChild variant="secondary" size="sm">
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    Abrir
                  </a>
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Apagar ${f.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Apagar "${f.name}"?`)) remove.mutate(f)
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
