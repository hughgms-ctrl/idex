import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link2, UserPlus } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { EditMemberDialog } from '@/features/members/EditMemberDialog'
import { InviteDialog, InviteLinkResult } from '@/features/members/InviteDialog'
import {
  memberKeys,
  useActiveInvites,
  useMinistryMembers,
  type MinistryMemberRow,
} from '@/features/members/queries'
import { useMinistryRoles } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, initials } from '@/lib/format'
import { inviteUrl } from '@/lib/invites'
import { supabase } from '@/lib/supabase'

export function MembersPage() {
  const { church, ministry, isLeader } = useChurch()
  const [params, setParams] = useSearchParams()
  const leader = ministry ? isLeader(ministry.id) : false
  const members = useMinistryMembers(ministry?.id)
  const roles = useMinistryRoles(ministry?.id)
  const [editing, setEditing] = useState<MinistryMemberRow | null>(null)
  const inviteOpen = leader && params.get('convidar') === '1'
  const setInviteOpen = (open: boolean) =>
    setParams(open ? { convidar: '1' } : {}, { replace: true })

  if (!ministry) {
    return <PageHeader title="Membros" description="Nenhum ministério cadastrado ainda." />
  }

  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]))
  const active = (members.data ?? []).filter((m) => m.status === 'active')
  const inactive = (members.data ?? []).filter((m) => m.status === 'inactive')

  return (
    <>
      <PageHeader
        title="Membros"
        description={`${ministry.name} · ${active.length} ${active.length === 1 ? 'integrante ativo' : 'integrantes ativos'}`}
        action={
          leader && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden="true" /> Convidar
            </Button>
          )
        }
      />

      {members.error ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : members.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <MemberList members={active} roleName={roleName} canEdit={leader} onEdit={setEditing} />
      )}

      {inactive.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle title="Inativos" />
          <MemberList members={inactive} roleName={roleName} canEdit={leader} onEdit={setEditing} />
        </section>
      )}

      {leader && (
        <PendingInvites
          ministryId={ministry.id}
          churchName={church.name}
          ministryName={ministry.name}
        />
      )}

      {leader && (
        <>
          <InviteDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            churchName={church.name}
            ministry={ministry}
            roles={roles.data ?? []}
          />
          <EditMemberDialog
            member={editing}
            ministryId={ministry.id}
            roles={roles.data ?? []}
            onOpenChange={(open) => !open && setEditing(null)}
          />
        </>
      )}
    </>
  )
}

function MemberList({
  members,
  roleName,
  canEdit,
  onEdit,
}: {
  members: MinistryMemberRow[]
  roleName: Map<string, string>
  canEdit: boolean
  onEdit: (member: MinistryMemberRow) => void
}) {
  if (members.length === 0) {
    return (
      <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
        Ninguém por aqui ainda. Convide a equipe pelo botão acima.
      </Panel>
    )
  }
  return (
    <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
      {members.map((m) => {
        const functions = m.roleIds
          .map((id) => roleName.get(id))
          .filter(Boolean)
          .join(', ')
        const content = (
          <>
            <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">
              {initials(m.name)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-medium">{m.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {functions || 'Sem função definida'}
              </span>
            </span>
            {m.role === 'leader' && <Badge>LÍDER</Badge>}
          </>
        )
        return (
          <li key={m.id} className="border-b last:border-b-0">
            {canEdit ? (
              <button
                type="button"
                onClick={() => onEdit(m)}
                className="hover:bg-secondary/50 flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left"
                aria-label={`Editar ${m.name}`}
              >
                {content}
              </button>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function PendingInvites({
  ministryId,
  churchName,
  ministryName,
}: {
  ministryId: string
  churchName: string
  ministryName: string
}) {
  const queryClient = useQueryClient()
  const invites = useActiveInvites(ministryId, true)
  const [showing, setShowing] = useState<string | null>(null)

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: memberKeys.invites(ministryId) })
      toast.success('Convite cancelado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (!invites.data || invites.data.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Convites ativos" />
      <ul className="flex flex-col gap-2">
        {invites.data.map((invite) => (
          <li key={invite.id}>
            <Panel className="gap-3">
              <div className="flex items-start gap-3">
                <Link2
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  <span className="font-medium">
                    {invite.email ??
                      (invite.max_uses > 1 ? 'Link para várias pessoas' : 'Link individual')}
                    {invite.role === 'leader' && ' · líder'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {invite.max_uses > 1 && `${invite.uses_count} de ${invite.max_uses} usos · `}
                    Expira {formatDateTime(invite.expires_at)}
                  </span>
                </div>
              </div>
              {showing === invite.id ? (
                <InviteLinkResult
                  link={inviteUrl(invite.token)}
                  churchName={churchName}
                  ministryName={ministryName}
                />
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowing(invite.id)}>
                    Mostrar link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(invite.id)}
                  >
                    Cancelar convite
                  </Button>
                </div>
              )}
            </Panel>
          </li>
        ))}
      </ul>
    </section>
  )
}
