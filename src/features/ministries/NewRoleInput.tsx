import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ministryKeys } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import { roleNameSchema } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

// Líder cadastra um instrumento/voz novo na hora (a lista não é fixa).
export function NewRoleInput({
  churchId,
  ministryId,
  nextOrder,
  onCreated,
  placeholder = 'Novo instrumento ou voz (ex.: Saxofone)',
}: {
  churchId: string
  ministryId: string
  nextOrder: number
  onCreated?: (roleId: string) => void
  placeholder?: string
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: async (value: string) => {
      const { data, error: err } = await supabase
        .from('ministry_roles')
        .insert({
          church_id: churchId,
          ministry_id: ministryId,
          name: value,
          sort_order: nextOrder,
        })
        .select('id')
        .single()
      if (err) {
        if (err.code === '23505') throw new Error('Já existe uma função com esse nome')
        throw err
      }
      return data.id
    },
    onSuccess: async (id) => {
      setName('')
      await queryClient.invalidateQueries({ queryKey: ministryKeys.roles(ministryId) })
      toast.success('Função cadastrada')
      onCreated?.(id)
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = roleNameSchema.safeParse(name)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Nome inválido')
          return
        }
        setError(null)
        add.mutate(parsed.data)
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Nova função"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={add.isPending}>
          <Plus aria-hidden="true" /> Adicionar
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}
