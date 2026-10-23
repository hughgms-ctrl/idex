import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/FormField'
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
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  fullName: z.string().trim().min(2, { message: 'Informe seu nome' }).max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[0-9 ()-]{8,20}$/.test(v), {
      message: 'Telefone inválido (ex.: +55 11 91234-5678)',
    }),
})
type Values = z.infer<typeof schema>

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: { id: string; full_name: string; phone: string | null }
}) {
  const queryClient = useQueryClient()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { fullName: profile.full_name, phone: profile.phone ?? '' },
  })
  const { errors } = form.formState

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: values.fullName, phone: values.phone || null })
        .eq('id', profile.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success('Perfil atualizado')
      onOpenChange(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>O telefone será usado para os avisos por WhatsApp.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField id="profile-name" label="Nome" error={errors.fullName?.message}>
            <Input id="profile-name" autoComplete="name" {...form.register('fullName')} />
          </FormField>
          <FormField id="profile-phone" label="WhatsApp" error={errors.phone?.message}>
            <Input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+55 11 91234-5678"
              {...form.register('phone')}
            />
          </FormField>
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
