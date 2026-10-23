import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useUser } from '@/auth/auth-context'
import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { memberKeys, type MinistryMemberRow } from '@/features/members/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/types/database'

export function EditMemberDialog({
  member,
  ministryId,
  roles,
  onOpenChange,
}: {
  member: MinistryMemberRow | null
  ministryId: string
  roles: Tables<'ministry_roles'>[]
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent>
        {member && (
          <EditMemberForm
            key={member.id}
            member={member}
            ministryId={ministryId}
            roles={roles}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditMemberForm({
  member,
  ministryId,
  roles,
  onDone,
}: {
  member: MinistryMemberRow
  ministryId: string
  roles: Tables<'ministry_roles'>[]
  onDone: () => void
}) {
  const user = useUser()
  const queryClient = useQueryClient()
  const [role, setRole] = useState<Enums<'ministry_member_role'>>(member.role)
  const [status, setStatus] = useState<Enums<'member_status'>>(member.status)
  const [roleIds, setRoleIds] = useState<string[]>(member.roleIds)
  const isSelf = member.user_id === user.id

  const invalidate = () => queryClient.invalidateQueries({ queryKey: memberKeys.list(ministryId) })

  const save = useMutation({
    mutationFn: async () => {
      if (role !== member.role || status !== member.status) {
        const { error } = await supabase
          .from('ministry_members')
          .update({ role, status })
          .eq('id', member.id)
        if (error) throw error
      }
      const toRemove = member.roleIds.filter((id) => !roleIds.includes(id))
      const toAdd = roleIds.filter((id) => !member.roleIds.includes(id))
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from('ministry_member_roles')
          .delete()
          .eq('ministry_member_id', member.id)
          .in('ministry_role_id', toRemove)
        if (error) throw error
      }
      if (toAdd.length > 0) {
        const { error } = await supabase.from('ministry_member_roles').insert(
          toAdd.map((ministry_role_id) => ({
            church_id: member.church_id,
            ministry_member_id: member.id,
            ministry_role_id,
          })),
        )
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Integrante atualizado')
      onDone()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{member.name}</DialogTitle>
        <DialogDescription>Funções, papel e situação no ministério.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Funções</legend>
          <div className="grid grid-cols-2 gap-1">
            {roles.map((r) => (
              <Label
                key={r.id}
                className="hover:bg-secondary min-h-11 cursor-pointer rounded-lg px-2 font-normal"
              >
                <Checkbox
                  checked={roleIds.includes(r.id)}
                  onCheckedChange={(v) =>
                    setRoleIds((ids) => (v ? [...ids, r.id] : ids.filter((id) => id !== r.id)))
                  }
                />
                {r.name}
              </Label>
            ))}
          </div>
        </fieldset>
        <FormField id="member-role" label="Papel">
          <NativeSelect
            id="member-role"
            value={role}
            disabled={isSelf}
            onChange={(e) => setRole(e.target.value as Enums<'ministry_member_role'>)}
          >
            <option value="member">Integrante</option>
            <option value="leader">Líder</option>
          </NativeSelect>
        </FormField>
        <FormField
          id="member-status"
          label="Situação"
          hint="Para tirar alguém da equipe, deixe como inativo: o histórico de pontos é mantido."
        >
          <NativeSelect
            id="member-status"
            value={status}
            disabled={isSelf}
            onChange={(e) => setStatus(e.target.value as Enums<'member_status'>)}
          >
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </NativeSelect>
        </FormField>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogFooter>
    </>
  )
}
