import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText, Image, Music2, Paperclip, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  BUCKET,
  MAX_BYTES,
  fileInfo,
  sizeLabel,
  songFileKeys,
  useSongFiles,
} from '@/features/songs/song-files'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

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
      for (const file of list) {
        if (file.size > MAX_BYTES) throw new Error(`"${file.name}" passa de 50 MB`)
        const { mime, kind } = fileInfo(file)
        if (kind === 'other') throw new Error(`"${file.name}": envie áudio, PDF ou imagem`)
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
        const path = `${churchId}/${songId}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: mime, upsert: false })
        if (error) throw error
        const { error: err } = await supabase.from('song_files').insert({
          church_id: churchId,
          song_id: songId,
          name: file.name.slice(0, 200),
          kind,
          storage_path: path,
          mime_type: mime,
          size_bytes: file.size,
        })
        if (err) {
          await supabase.storage.from(BUCKET).remove([path])
          throw err
        }
      }
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
    mutationFn: async (file: { id: string; storage_path: string }) => {
      const { error } = await supabase.storage.from(BUCKET).remove([file.storage_path])
      if (error) throw error
      const { error: err } = await supabase.from('song_files').delete().eq('id', file.id)
      if (err) throw err
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const list = files.data ?? []
  if (!canEdit && list.length === 0) return null

  return (
    <section aria-label="Áudios e arquivos" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Paperclip className="text-primary size-4" aria-hidden="true" /> Áudios e arquivos
        </h2>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,application/pdf,image/*"
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
              <Upload aria-hidden="true" /> {upload.isPending ? 'Enviando…' : 'Enviar arquivo'}
            </Button>
          </>
        )}
      </div>
      {files.isPending ? (
        <p className="text-muted-foreground text-sm">Carregando arquivos…</p>
      ) : list.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          Envie o áudio de referência (MP3, M4A, WAV…), o PDF da partitura ou uma imagem, até 50 MB.
          A equipe ouve e abre aqui no app.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((f) => (
            <li key={f.id} className="bg-card flex flex-col gap-2 rounded-2xl border p-3">
              <div className="flex items-center gap-2">
                {f.kind === 'audio' ? (
                  <Music2 className="text-primary size-4 shrink-0" aria-hidden="true" />
                ) : f.kind === 'image' ? (
                  <Image className="text-primary size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <FileText className="text-primary size-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {sizeLabel(f.size_bytes)}
                </span>
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
              </div>
              {f.url &&
                (f.kind === 'audio' ? (
                  <audio controls preload="none" src={f.url} className="h-11 w-full">
                    Seu navegador não toca este áudio.
                  </audio>
                ) : (
                  <Button asChild variant="secondary" size="sm" className="self-start">
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      {f.kind === 'pdf' ? 'Abrir PDF' : 'Abrir imagem'}
                    </a>
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
