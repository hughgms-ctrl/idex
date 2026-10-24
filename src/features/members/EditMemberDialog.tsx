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
import { Switch } from '@/components/ui/switch'
import { memberKeys, type MinistryMemberRow } from '@/features/members/queries'
import { NewRoleInput } from '@/features/ministries/NewRoleInput'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/types/database'

type PermissionKey =
  'can_edit_songs' | 'can_manage_song_files' | 'can_edit_setlists' | 'can_send_announcements'

// Chavinhas por integrante: o líder dá só o que a pessoa precisa (ex.: diretor musical).
const PERMISSIONS: { key: PermissionKey; title: string; hint: string }[] = [
  {
    key: 'can_edit_songs',
    title: 'Cifras e repertório',
    hint: 'Cadastra músicas, edita cifras e importa do Cifra Club.',
  },
  {
    key: 'can_manage_song_files',
    title: 'Áudios e arquivos',
    hint: 'Envia, renomeia e apaga áudios, PDFs e imagens das músicas.',
  },
  {
    key: 'can_edit_setlists',
    title: 'Setlist dos cultos',
    hint: 'Monta o repertório de qualquer culto, mesmo sem estar escalado como ministro.',
  },
  {
    key: 'can_send_announcements',
    title: 'Central de avisos',
    hint: 'Envia avisos no celular (e WhatsApp) para a equipe, na hora ou agendados.',
  },
]

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
  const [perms, setPerms] = useState<Record<PermissionKey, boolean>>({
    can_edit_songs: member.can_edit_songs,
    can_manage_song_files: member.can_manage_song_files,
    can_edit_setlists: member.can_edit_setlists,
    can_send_announcements: member.can_send_announcements,
  })
  const isSelf = member.user_id === user.id

  const invalidate = () => queryClient.invalidateQueries({ queryKey: memberKeys.list(ministryId) })

  const save = useMutation({
    mutationFn: async () => {
      const permsChanged = PERMISSIONS.some((p) => perms[p.key] !== member[p.key])
      if (role !== member.role || status !== member.status || permsChanged) {
        const { error } = await supabase
          .from('ministry_members')
          .update({ role, status, ...perms })
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
        <DialogDescription>
          Instrumentos e vozes, liderança, permissões e situação no ministério.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Instrumentos e vozes</legend>
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
          <NewRoleInput
            churchId={member.church_id}
            ministryId={ministryId}
            nextOrder={roles.length + 1}
            placeholder="Outro instrumento ou voz"
            onCreated={(id) => setRoleIds((ids) => [...ids, id])}
          />
        </fieldset>
        <Label
          className={cn(
            'flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal',
            role === 'leader' && 'border-primary',
            isSelf && 'cursor-not-allowed opacity-60',
          )}
        >
          <Checkbox
            className="mt-0.5"
            checked={role === 'leader'}
            disabled={isSelf}
            onCheckedChange={(v) => setRole(v ? 'leader' : 'member')}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">Líder do ministério</span>
            <span className="text-muted-foreground text-[13px] leading-snug">
              Monta a escala, abre a disponibilidade, projeta o QR, aprova pedidos, cuida do
              repertório e pode nomear outros líderes.
              {isSelf && ' (Outro líder precisa mudar o seu papel.)'}
            </span>
          </span>
        </Label>
        {role !== 'leader' && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Permissões extras</legend>
            <p className="text-muted-foreground mb-1 text-[13px] leading-snug">
              Para quem ajuda sem ser líder, como o diretor musical.
            </p>
            {PERMISSIONS.map((p) => (
              <Label
                key={p.key}
                className={cn(
                  'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 font-normal',
                  perms[p.key] && 'border-primary',
                )}
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{p.title}</span>
                  <span className="text-muted-foreground text-[13px] leading-snug">{p.hint}</span>
                </span>
                <Switch
                  checked={perms[p.key]}
                  onCheckedChange={(v) => setPerms((cur) => ({ ...cur, [p.key]: v }))}
                />
              </Label>
            ))}
          </fieldset>
        )}
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
