import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { SectionTitle } from '@/components/Section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { supportKeys, useMinistrySupporters, type SupporterRow } from '@/features/support/queries'
import { errorMessage } from '@/lib/errors'
import { initials } from '@/lib/format'
import { supportLabelSchema } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

/** Só o líder: quem é apoio do ministério (só consulta). */
export function SupportersSection({ ministryId }: { ministryId: string }) {
  const supporters = useMinistrySupporters(ministryId, true)
  const [editing, setEditing] = useState<SupporterRow | null>(null)

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        title="Apoio (só consulta)"
        action={
          <Link to="/apoio" className="text-primary inline-flex items-center gap-1 text-[13px]">
            <Eye className="size-4" aria-hidden="true" /> Ver como o apoio vê
          </Link>
        }
      />
      <p className="text-muted-foreground -mt-1 text-[13px]">
        Veem horários dos cultos e ensaios, a equipe e a setlist com as cifras no tom do culto. Não
        entram na escala, nos pontos nem nas conversas. Para convidar, use “Convidar” → “Apoio”.
      </p>
      {(supporters.data ?? []).length > 0 && (
        <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          {(supporters.data ?? []).map((s) => (
            <li key={s.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => setEditing(s)}
                className="hover:bg-secondary/50 flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left"
                aria-label={`Editar ${s.name}`}
              >
                <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{s.name}</span>
                <Badge variant="outline">{s.label}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      <EditSupporterDialog
        supporter={editing}
        ministryId={ministryId}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </section>
  )
}

function EditSupporterDialog({
  supporter,
  ministryId,
  onOpenChange,
}: {
  supporter: SupporterRow | null
  ministryId: string
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!supporter} onOpenChange={onOpenChange}>
      <DialogContent>
        {supporter && (
          <EditSupporterForm
            key={supporter.id}
            supporter={supporter}
            ministryId={ministryId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditSupporterForm({
  supporter,
  ministryId,
  onDone,
}: {
  supporter: SupporterRow
  ministryId: string
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [label, setLabel] = useState(supporter.label)
  const [confirming, setConfirming] = useState(false)
  const parsed = supportLabelSchema.safeParse(label)
  const done = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: supportKeys.list(ministryId) })
    toast.success(message)
    onDone()
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) return
      const { error } = await supabase
        .from('ministry_supporters')
        .update({ label: parsed.data })
        .eq('id', supporter.id)
      if (error) throw error
    },
    onSuccess: () => done('Apoio atualizado'),
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('remove_supporter', { p_supporter_id: supporter.id })
      if (error) throw error
    },
    onSuccess: () => done('Apoio removido'),
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{supporter.name}</DialogTitle>
        <DialogDescription>
          Apoio do ministério: só consulta a agenda e as cifras.
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (parsed.success) save.mutate()
        }}
      >
        <FormField
          id="supporter-label"
          label="O que essa pessoa faz"
          error={label.trim() === '' ? 'Escreva o que essa pessoa faz' : undefined}
        >
          <Input
            id="supporter-label"
            autoComplete="off"
            maxLength={40}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </FormField>
        {confirming ? (
          <div className="border-destructive/40 flex flex-col gap-2 rounded-xl border p-3 text-sm">
            <p>
              {supporter.name} deixa de ver a agenda. Se não fizer parte de nenhum ministério, sai
              também da igreja no app.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? 'Tirando…' : 'Tirar o apoio'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive self-start"
            onClick={() => setConfirming(true)}
          >
            Tirar o apoio
          </Button>
        )}
        <DialogFooter>
          <Button type="submit" disabled={!parsed.success || save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
