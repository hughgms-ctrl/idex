import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import type { CategorySlot } from '@domain/planning.ts'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { categoryKeys, DEFAULT_CATEGORIES, type SongCategory } from '@/features/songs/categories'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/** Lista de tipos do ministério: cadastrar, renomear, apagar (grava na hora). */
export function CategoryList({
  churchId,
  ministryId,
  categories,
}: {
  churchId: string
  ministryId: string
  categories: SongCategory[]
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: categoryKeys.list(ministryId) })
    await queryClient.invalidateQueries({ queryKey: ['planning'] })
  }
  const friendly = (err: { code?: string }) =>
    err.code === '23505' ? new Error('Já existe um tipo com esse nome') : err

  const create = useMutation({
    mutationFn: async (names: string[]) => {
      const rows = names
        .map((n) => n.trim())
        .filter((n) => n && !categories.some((c) => c.name.toLowerCase() === n.toLowerCase()))
        .map((n, i) => ({
          church_id: churchId,
          ministry_id: ministryId,
          name: n.slice(0, 30),
          sort_order: categories.length + i + 1,
        }))
      if (rows.length === 0) throw new Error('Esse tipo já existe')
      const { error } = await supabase.from('song_categories').insert(rows)
      if (error) throw friendly(error)
    },
    onSuccess: async () => {
      setName('')
      await invalidate()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const rename = useMutation({
    mutationFn: async ({ id, name: next }: { id: string; name: string }) => {
      if (!next.trim()) throw new Error('Informe o nome')
      const { error } = await supabase
        .from('song_categories')
        .update({ name: next.trim().slice(0, 30) })
        .eq('id', id)
      if (error) throw friendly(error)
    },
    onSuccess: async () => {
      setEditing(null)
      await invalidate()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('song_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <div className="flex flex-col gap-2">
      {categories.length === 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
          <p className="text-muted-foreground text-[13px]">
            Nenhum tipo ainda. Comece pela sugestão e ajuste depois:
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={create.isPending}
            onClick={() => create.mutate(DEFAULT_CATEGORIES)}
          >
            Usar {DEFAULT_CATEGORIES.join(', ')}
          </Button>
        </div>
      )}
      <ul className="flex flex-wrap gap-2">
        {categories.map((c) =>
          editing?.id === c.id ? (
            <li key={c.id} className="w-full">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  rename.mutate(editing)
                }}
              >
                <Input
                  aria-label={`Novo nome de ${c.name}`}
                  autoFocus
                  maxLength={30}
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                />
                <Button type="submit" size="sm" disabled={rename.isPending}>
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </form>
            </li>
          ) : (
            <li
              key={c.id}
              className="bg-secondary flex min-h-9 items-center gap-1 rounded-[10px] py-1 pr-1 pl-3 text-sm"
            >
              {c.name}
              <button
                type="button"
                aria-label={`Renomear ${c.name}`}
                onClick={() => setEditing({ id: c.id, name: c.name })}
                className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-md"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label={`Apagar o tipo ${c.name}`}
                onClick={() => {
                  if (window.confirm(`Apagar "${c.name}"? As músicas perdem essa marcação.`))
                    remove.mutate(c.id)
                }}
                className="text-muted-foreground hover:text-destructive flex size-9 items-center justify-center rounded-md"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ),
        )}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) create.mutate([name])
        }}
      >
        <Input
          aria-label="Novo tipo de música"
          placeholder="Novo tipo (ex.: Celebração)"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
          <Plus aria-hidden="true" /> Incluir
        </Button>
      </form>
    </div>
  )
}

/** Estrutura do culto: partes em ordem, cada uma com um tipo e quantas músicas. */
export function SlotsEditor({
  categories,
  value,
  onChange,
}: {
  categories: SongCategory[]
  value: CategorySlot[]
  onChange: (next: CategorySlot[]) => void
}) {
  const set = (i: number, patch: Partial<CategorySlot>) =>
    onChange(value.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...value]
    const [item] = next.splice(i, 1)
    if (item) next.splice(i + d, 0, item)
    onChange(next)
  }
  if (categories.length === 0) {
    return (
      <p className="text-muted-foreground text-[13px]">
        Cadastre os tipos acima para montar a estrutura do culto.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && (
        <p className="text-muted-foreground text-[13px]">
          Sem estrutura: a sugestão escolhe qualquer música. Inclua as partes na ordem do culto.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {value.map((slot, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-5 text-center font-mono text-xs">{i + 1}</span>
            <div className="flex items-center rounded-xl border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Menos uma música"
                disabled={slot.count <= 1}
                onClick={() => set(i, { count: slot.count - 1 })}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-6 text-center font-mono text-sm font-semibold">{slot.count}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Mais uma música"
                disabled={slot.count >= 10}
                onClick={() => set(i, { count: slot.count + 1 })}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <NativeSelect
              aria-label={`Tipo da parte ${i + 1}`}
              className="min-w-0 flex-1"
              value={slot.categoryId}
              onChange={(e) => set(i, { categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Descer"
              disabled={i === value.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Tirar a parte ${i + 1}`}
              onClick={() => onChange(value.filter((_, k) => k !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ol>
      {value.length < 12 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange([
              ...value,
              {
                categoryId:
                  categories.find((c) => !value.some((s) => s.categoryId === c.id))?.id ??
                  categories[0]!.id,
                count: 1,
              },
            ])
          }
        >
          <Plus aria-hidden="true" /> Incluir parte
        </Button>
      )}
    </div>
  )
}
