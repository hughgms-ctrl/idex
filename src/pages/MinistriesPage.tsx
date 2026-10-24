import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
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
import { NativeSelect } from '@/components/ui/native-select'
import { useChurch } from '@/features/church/church-context'
import { churchKeys } from '@/features/church/queries'
import { NewRoleInput } from '@/features/ministries/NewRoleInput'
import { ministryKeys, useMinistryRoles, useMinistrySettings } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import {
  MINISTRY_KIND_LABEL,
  ministrySchema,
  roleNameSchema,
  type MinistryInput,
} from '@/lib/schemas'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export function MinistriesPage() {
  const { church, ministries, ministry, isOwner, isLeader, selectMinistry } = useChurch()
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; ministry: Tables<'ministries'> } | null
  >(null)

  return (
    <>
      <PageHeader
        title="Ministérios"
        description={church.name}
        action={
          isOwner && (
            <Button onClick={() => setDialog({ mode: 'create' })}>
              <Plus aria-hidden="true" /> Novo ministério
            </Button>
          )
        }
      />

      <ul className="flex flex-col gap-2">
        {ministries.map((m) => (
          <li key={m.id}>
            <Panel className="flex-row items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{m.name}</span>
                <span className="text-muted-foreground text-xs">
                  {MINISTRY_KIND_LABEL[m.kind as MinistryInput['kind']] ?? m.kind}
                </span>
              </div>
              {m.id === ministry?.id ? (
                <Badge variant="secondary">Selecionado</Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => selectMinistry(m.id)}>
                  Abrir
                </Button>
              )}
              {isLeader(m.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ mode: 'edit', ministry: m })}
                >
                  Renomear
                </Button>
              )}
            </Panel>
          </li>
        ))}
      </ul>

      {ministry && <RolesSection ministry={ministry} canEdit={isLeader(ministry.id)} />}
      {ministry && <SettingsSummary ministryId={ministry.id} />}

      <MinistryDialog
        state={dialog}
        churchId={church.id}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </>
  )
}

function MinistryDialog({
  state,
  churchId,
  onOpenChange,
}: {
  state: { mode: 'create' } | { mode: 'edit'; ministry: Tables<'ministries'> } | null
  churchId: string
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const editing = state?.mode === 'edit' ? state.ministry : null
  const form = useForm<MinistryInput>({
    resolver: zodResolver(ministrySchema),
    values: {
      name: editing?.name ?? '',
      kind: (editing?.kind as MinistryInput['kind'] | undefined) ?? 'worship',
    },
  })
  const { errors } = form.formState

  const save = useMutation({
    mutationFn: async (values: MinistryInput) => {
      const { error } = editing
        ? await supabase.from('ministries').update({ name: values.name }).eq('id', editing.id)
        : await supabase
            .from('ministries')
            .insert({ church_id: churchId, name: values.name, kind: values.kind })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: churchKeys.ministries(churchId) })
      toast.success(editing ? 'Ministério renomeado' : 'Ministério criado')
      onOpenChange(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Renomear ministério' : 'Novo ministério'}</DialogTitle>
          {!editing && (
            <DialogDescription>
              Ele já nasce com as regras de pontos padrão e um ciclo aberto.
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField id="ministry-name" label="Nome" error={errors.name?.message}>
            <Input
              id="ministry-name"
              aria-invalid={Boolean(errors.name)}
              {...form.register('name')}
            />
          </FormField>
          {!editing && (
            <FormField id="ministry-kind" label="Tipo">
              <NativeSelect id="ministry-kind" {...form.register('kind')}>
                {Object.entries(MINISTRY_KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RolesSection({ ministry, canEdit }: { ministry: Tables<'ministries'>; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const roles = useMinistryRoles(ministry.id)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ministryKeys.roles(ministry.id) })

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const parsed = roleNameSchema.safeParse(name)
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Nome inválido')
      const { error: err } = await supabase
        .from('ministry_roles')
        .update({ name: parsed.data })
        .eq('id', id)
      if (err) throw err.code === '23505' ? new Error('Já existe uma função com esse nome') : err
    },
    onSuccess: async () => {
      setEditing(null)
      await invalidate()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.from('ministry_roles').delete().eq('id', id)
      if (err) throw err
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title={`Instrumentos e vozes · ${ministry.name}`} />
      <Panel className="gap-2">
        {canEdit && (
          <p className="text-muted-foreground text-[13px]">
            A lista é sua: cadastre, renomeie ou remova. Os integrantes escolhem entre estas opções.
          </p>
        )}
        <ul className="flex flex-wrap gap-2">
          {(roles.data ?? []).map((r) =>
            editing?.id === r.id ? (
              <li key={r.id} className="flex w-full gap-2">
                <form
                  className="flex w-full gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    rename.mutate(editing)
                  }}
                >
                  <Input
                    aria-label={`Novo nome de ${r.name}`}
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ id: r.id, name: e.target.value })}
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
                key={r.id}
                className="bg-secondary flex min-h-9 items-center gap-1 rounded-[10px] py-1 pr-1 pl-3 text-sm"
              >
                {r.name}
                {canEdit && (
                  <>
                    <button
                      type="button"
                      aria-label={`Renomear ${r.name}`}
                      onClick={() => setEditing({ id: r.id, name: r.name })}
                      className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-md"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover função ${r.name}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remover "${r.name}"? Quem tinha essa função perde a marcação.`,
                          )
                        )
                          remove.mutate(r.id)
                      }}
                      className="text-muted-foreground hover:text-destructive flex size-9 items-center justify-center rounded-md"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </li>
            ),
          )}
          {roles.data?.length === 0 && (
            <li className="text-muted-foreground text-sm">Nenhuma função cadastrada.</li>
          )}
        </ul>
        {canEdit && (
          <NewRoleInput
            churchId={ministry.church_id}
            ministryId={ministry.id}
            nextOrder={(roles.data?.length ?? 0) + 1}
          />
        )}
      </Panel>
    </section>
  )
}

function SettingsSummary({ ministryId }: { ministryId: string }) {
  const settings = useMinistrySettings(ministryId)
  const s = settings.data
  if (!s) return null
  const tiers = Array.isArray(s.late_penalty_tiers)
    ? (s.late_penalty_tiers as { upToMin: number | null; points: number }[])
    : []
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Regras de pontos" />
      <div className="border-input text-muted-foreground rounded-2xl border border-dashed p-4 text-[13px] leading-relaxed">
        Ciclo de {s.cycle_months} meses · começa com {s.cycle_starting_points} pontos · mínimo de{' '}
        {s.cycle_min_points} para continuar na escala. Tolerância de {s.late_tolerance_min} min;
        depois disso:{' '}
        {tiers
          .map((t) => (t.upToMin ? `até ${t.upToMin} min −${t.points}` : `acima −${t.points}`))
          .join(', ')}
        . Falta sem aviso: −{s.absence_penalty}. Até {s.checkin_request_limit_per_cycle} pedidos de
        “esqueci de registrar” por ciclo.
      </div>
    </section>
  )
}
