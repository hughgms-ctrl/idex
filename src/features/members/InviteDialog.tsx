import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Copy, MessageCircle } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { memberKeys } from '@/features/members/queries'
import { errorMessage } from '@/lib/errors'
import { inviteMessage, inviteUrl, whatsappShareUrl } from '@/lib/invites'
import { inviteSchema, type InviteInput } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export function InviteDialog({
  open,
  onOpenChange,
  churchName,
  ministry,
  roles,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchName: string
  ministry: Tables<'ministries'>
  roles: Tables<'ministry_roles'>[]
}) {
  const user = useUser()
  const queryClient = useQueryClient()
  const [link, setLink] = useState<string | null>(null)
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      role: 'member',
      ministryRoleIds: [],
      multiUse: false,
      expiresInDays: 7,
      email: '',
    },
  })
  const { errors } = form.formState

  const create = useMutation({
    mutationFn: async (values: InviteInput) => {
      const { data, error } = await supabase
        .from('invites')
        .insert({
          church_id: ministry.church_id,
          ministry_id: ministry.id,
          role: values.role,
          ministry_role_ids: values.ministryRoleIds,
          max_uses: values.multiUse ? 50 : 1,
          expires_at: new Date(Date.now() + values.expiresInDays * 86_400_000).toISOString(),
          email: values.email || null,
          created_by: user.id,
        })
        .select('token')
        .single()
      if (error) throw error
      return data.token
    },
    onSuccess: async (token) => {
      setLink(inviteUrl(token))
      await queryClient.invalidateQueries({ queryKey: memberKeys.invites(ministry.id) })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      setLink(null)
      form.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar para {ministry.name}</DialogTitle>
          <DialogDescription>
            Gere um link e mande pelo WhatsApp. Quem abrir cria a conta e já entra na equipe.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <InviteLinkResult link={link} churchName={churchName} ministryName={ministry.name} />
        ) : (
          <form
            onSubmit={form.handleSubmit((v) => create.mutate(v))}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormField id="invite-role" label="Entra como">
              <NativeSelect id="invite-role" {...form.register('role')}>
                <option value="member">Integrante</option>
                <option value="leader">Líder do ministério</option>
              </NativeSelect>
            </FormField>

            {roles.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Funções (opcional)</legend>
                <Controller
                  control={form.control}
                  name="ministryRoleIds"
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-1">
                      {roles.map((role) => {
                        const checked = field.value.includes(role.id)
                        return (
                          <Label
                            key={role.id}
                            className="hover:bg-secondary min-h-11 cursor-pointer rounded-lg px-2 font-normal"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                field.onChange(
                                  value
                                    ? [...field.value, role.id]
                                    : field.value.filter((id) => id !== role.id),
                                )
                              }
                            />
                            {role.name}
                          </Label>
                        )
                      })}
                    </div>
                  )}
                />
              </fieldset>
            )}

            <Controller
              control={form.control}
              name="multiUse"
              render={({ field }) => (
                <Label className="min-h-11 cursor-pointer font-normal">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                  Link para várias pessoas (ex.: grupo do WhatsApp)
                </Label>
              )}
            />

            <FormField id="invite-days" label="Validade">
              <NativeSelect
                id="invite-days"
                {...form.register('expiresInDays', { valueAsNumber: true })}
              >
                <option value={1}>1 dia</option>
                <option value={7}>7 dias</option>
                <option value={30}>30 dias</option>
              </NativeSelect>
            </FormField>

            <FormField
              id="invite-email"
              label="E-mail (opcional)"
              error={errors.email?.message}
              hint="Se preencher, só essa pessoa consegue usar o link."
            >
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                {...form.register('email')}
              />
            </FormField>

            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Gerando…' : 'Gerar link de convite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function InviteLinkResult({
  link,
  churchName,
  ministryName,
}: {
  link: string
  churchName: string
  ministryName: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor="invite-link">Link do convite</Label>
      <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copiado' : 'Copiar link'}
        </Button>
        <Button asChild>
          <a
            href={whatsappShareUrl(inviteMessage(churchName, ministryName, link))}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle aria-hidden="true" /> Enviar no WhatsApp
          </a>
        </Button>
      </div>
    </div>
  )
}
