import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'
import { z } from 'zod'

import { AuthShell } from '@/components/AuthShell'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { savePendingChurch } from '@/features/church/pending-church'
import { useCreateChurch } from '@/features/church/useCreateChurch'
import { errorMessage } from '@/lib/errors'
import { churchSchema, signUpSchema } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

const schema = signUpSchema.and(churchSchema)
type Values = z.infer<typeof schema>

// Cadastro de igreja para quem ainda não tem conta: cria a conta e a igreja.
export function SignUpChurchPage() {
  const navigate = useNavigate()
  const createChurch = useCreateChurch()
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      churchName: '',
      ministryName: 'Louvor',
    },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName },
        emailRedirectTo: `${window.location.origin}/bem-vindo`,
      },
    })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    const church = { churchName: values.churchName, ministryName: values.ministryName }
    if (!data.session) {
      // Projeto com confirmação de e-mail: termina depois do clique no link.
      savePendingChurch(church)
      setConfirmEmail(values.email)
      return
    }
    try {
      await createChurch.mutateAsync({ ...church, fullName: values.fullName })
      toast.success('Igreja cadastrada! Agora convide sua equipe.')
      navigate('/membros', { replace: true })
    } catch (err) {
      savePendingChurch(church)
      toast.error(errorMessage(err))
      navigate('/bem-vindo', { replace: true })
    }
  })

  if (confirmEmail) {
    return (
      <AuthShell title="Quase lá">
        <Alert>
          <MailCheck aria-hidden="true" />
          <AlertTitle>Confirme seu e-mail</AlertTitle>
          <AlertDescription>
            Enviamos um link para <strong className="text-foreground">{confirmEmail}</strong>. Ao
            abrir, a igreja é criada automaticamente.
          </AlertDescription>
        </Alert>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Cadastrar igreja"
      subtitle="Você vira o responsável pela igreja e líder do ministério."
      footer={
        <span className="text-muted-foreground">
          Já tem conta?{' '}
          <Link
            to="/entrar"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormField id="churchName" label="Nome da igreja" error={errors.churchName?.message}>
          <Input
            id="churchName"
            autoComplete="organization"
            placeholder="Ex.: Igreja Esperança"
            aria-invalid={Boolean(errors.churchName)}
            {...form.register('churchName')}
          />
        </FormField>
        <FormField
          id="ministryName"
          label="Primeiro ministério"
          error={errors.ministryName?.message}
        >
          <Input
            id="ministryName"
            aria-invalid={Boolean(errors.ministryName)}
            {...form.register('ministryName')}
          />
        </FormField>
        <FormField id="fullName" label="Seu nome" error={errors.fullName?.message}>
          <Input
            id="fullName"
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            {...form.register('fullName')}
          />
        </FormField>
        <FormField id="email" label="E-mail" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-invalid={Boolean(errors.email)}
            {...form.register('email')}
          />
        </FormField>
        <FormField id="password" label="Senha" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register('password')}
          />
        </FormField>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Cadastrando…' : 'Cadastrar igreja'}
        </Button>
      </form>
    </AuthShell>
  )
}
