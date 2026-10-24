import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { availabilityKeys, useMyRoleIds } from '@/features/availability/queries'
import { useChurch } from '@/features/church/church-context'
import { memberKeys } from '@/features/members/queries'
import { NewRoleInput } from '@/features/ministries/NewRoleInput'
import { useMinistryRoles } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// O integrante marca os instrumentos/vozes em que pode servir.
// Na primeira vez (?inicio=1) segue para a disponibilidade.
export function MyRolesPage() {
  const { church, ministry, memberships, isLeader } = useChurch()
  const [params] = useSearchParams()
  const onboarding = params.get('inicio') === '1'
  const membership = memberships.find((m) => m.ministry_id === ministry?.id)
  const roles = useMinistryRoles(ministry?.id)
  const mine = useMyRoleIds(membership?.id)

  if (roles.error || mine.error) return <ErrorState error={roles.error ?? mine.error} />
  if (!membership) {
    return (
      <PageHeader
        title="Minhas funções"
        description={`Você não faz parte da equipe de ${ministry?.name ?? 'nenhum ministério'}.`}
      />
    )
  }
  if (roles.isPending || mine.isPending) return <FullScreenLoader />
  return (
    <RolesForm
      key={mine.data.join(',')}
      churchId={church.id}
      memberId={membership.id}
      ministryId={ministry?.id ?? ''}
      ministryName={ministry?.name ?? ''}
      canManage={ministry ? isLeader(ministry.id) : false}
      roles={roles.data}
      initial={mine.data}
      onboarding={onboarding}
    />
  )
}

function RolesForm({
  churchId,
  memberId,
  ministryId,
  ministryName,
  canManage,
  roles,
  initial,
  onboarding,
}: {
  churchId: string
  memberId: string
  ministryId: string
  ministryName: string
  canManage: boolean
  roles: { id: string; name: string }[]
  initial: string[]
  onboarding: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(() => new Set(initial))

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = useMutation({
    mutationFn: async () => {
      const before = new Set(initial)
      const added = [...selected].filter((id) => !before.has(id))
      const removed = initial.filter((id) => !selected.has(id))
      if (added.length) {
        const { error } = await supabase.from('ministry_member_roles').insert(
          added.map((ministry_role_id) => ({
            church_id: churchId,
            ministry_member_id: memberId,
            ministry_role_id,
          })),
        )
        if (error) throw error
      }
      if (removed.length) {
        const { error } = await supabase
          .from('ministry_member_roles')
          .delete()
          .eq('ministry_member_id', memberId)
          .in('ministry_role_id', removed)
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: availabilityKeys.all }),
        // ['ministry-members', id]: invalida a lista de todos os ministérios
        queryClient.invalidateQueries({ queryKey: [memberKeys.list('')[0]] }),
      ])
      toast.success('Funções salvas')
      navigate(onboarding ? '/disponibilidade?inicio=1' : '/')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <>
      <PageHeader
        eyebrow={onboarding ? 'PASSO 1 DE 3' : undefined}
        title="Em que você pode servir?"
        description={`Marque os instrumentos e vozes em que você pode ajudar no ${ministryName}. O líder usa isso para montar a escala.`}
      />
      {roles.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ainda não há instrumentos ou vozes cadastrados neste ministério.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5">
          {roles.map((role) => {
            const on = selected.has(role.id)
            return (
              <li key={role.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(role.id)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-2 rounded-2xl border px-3.5 text-left text-[15px] font-medium transition-colors',
                    on ? 'border-primary bg-primary/10 text-primary' : 'bg-card',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-md border',
                      on && 'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {on && <Check className="size-3.5" aria-hidden="true" />}
                  </span>
                  {role.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {canManage ? (
        <NewRoleInput
          churchId={churchId}
          ministryId={ministryId}
          nextOrder={roles.length + 1}
          onCreated={(id) => setSelected((prev) => new Set(prev).add(id))}
        />
      ) : (
        <p className="text-muted-foreground text-[13px]">
          Não achou seu instrumento ou voz? Peça ao líder para cadastrar.
        </p>
      )}
      <Button
        size="lg"
        className="min-h-14 rounded-2xl text-[17px]"
        disabled={save.isPending || (onboarding && selected.size === 0 && roles.length > 0)}
        onClick={() => save.mutate()}
      >
        {save.isPending ? 'Salvando…' : onboarding ? 'Continuar' : 'Salvar'}
      </Button>
      {onboarding && (
        <Button variant="ghost" onClick={() => navigate('/disponibilidade?inicio=1')}>
          Pular por agora
        </Button>
      )}
    </>
  )
}
