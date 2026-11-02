import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CategoryChips } from '@/features/songs/CategoryChips'
import type { SongCategory } from '@/features/songs/categories'
import { songKeys } from '@/features/songs/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type SongRow = { id: string; title: string; category_ids: string[] }

/** Marcar o tipo de cada música de uma vez (grava a cada toque). */
export function CategorizeSongsDialog({
  open,
  onOpenChange,
  songs,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  songs: SongRow[]
  categories: SongCategory[]
}) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  // o que já foi marcado aqui (a lista do plano só atualiza depois)
  const [local, setLocal] = useState<Record<string, string[]>>({})
  const valueOf = (s: SongRow) => local[s.id] ?? s.category_ids

  const save = useMutation({
    mutationFn: async ({ id, ids }: { id: string; ids: string[] }) => {
      const { error } = await supabase.from('songs').update({ category_ids: ids }).eq('id', id)
      if (error) throw error
    },
    onMutate: ({ id, ids }) => setLocal((m) => ({ ...m, [id]: ids })),
    onError: (err, { id }) => {
      setLocal((m) => {
        const next = { ...m }
        delete next[id]
        return next
      })
      toast.error(errorMessage(err))
    },
  })

  const q = query.trim().toLowerCase()
  const visible = songs.filter(
    (s) => (!q || s.title.toLowerCase().includes(q)) && (!onlyMissing || valueOf(s).length === 0),
  )
  const missing = songs.filter((s) => valueOf(s).length === 0).length

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          void queryClient.invalidateQueries({ queryKey: ['planning'] })
          void queryClient.invalidateQueries({ queryKey: songKeys.all })
          setLocal({})
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[88dvh] flex-col">
        <DialogHeader>
          <DialogTitle>Classificar músicas</DialogTitle>
          <DialogDescription>
            Toque nos tipos de cada música. Grava na hora. {missing}{' '}
            {missing === 1 ? 'música sem tipo' : 'músicas sem tipo'}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            aria-label="Buscar música"
            placeholder="Buscar pelo nome"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            aria-pressed={onlyMissing}
            onClick={() => setOnlyMissing(!onlyMissing)}
            className={cn(
              'min-h-11 shrink-0 rounded-xl border px-3 text-[13px]',
              onlyMissing ? 'border-primary text-primary font-semibold' : 'text-muted-foreground',
            )}
          >
            Só sem tipo
          </button>
        </div>
        <ul className="-mx-1 flex flex-col gap-2 overflow-y-auto px-1">
          {visible.map((s) => (
            <li key={s.id} className="bg-card flex flex-col gap-2 rounded-xl border p-3">
              <span className="text-sm font-medium">{s.title}</span>
              <CategoryChips
                label={`Tipos de ${s.title}`}
                categories={categories}
                value={valueOf(s)}
                onChange={(ids) => save.mutate({ id: s.id, ids })}
              />
            </li>
          ))}
          {visible.length === 0 && (
            <li className="text-muted-foreground py-6 text-center text-sm">
              {onlyMissing ? 'Todas as músicas já têm tipo.' : 'Nenhuma música com esse nome.'}
            </li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
