import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'

import { safeNext } from '@/lib/safe-next'
import { AuthShell } from '@/components/AuthShell'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { errorMessage } from '@/lib/errors'
import { loginSchema, magicLinkSchema, type LoginInput } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse a escala, o repertório e seus pontos."
      footer={
        <span className="text-muted-foreground">
          Sua igreja ainda não usa o ide.x?{' '}
          <Link
            to="/cadastro"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Cadastrar igreja
          </Link>
        </span>
      }
    >
      <Tabs defaultValue="senha">
        <TabsList>
          <TabsTrigger value="senha">Com senha</TabsTrigger>
          <TabsTrigger value="link">Link por e-mail</TabsTrigger>
        </TabsList>
        <TabsContent value="senha">
          <PasswordForm next={next} />
        </TabsContent>
        <TabsContent value="link">
          <MagicLinkForm next={next} />
        </TabsContent>
      </Tabs>
    </AuthShell>
  )
}

function PasswordForm({ next }: { next: string }) {
  const navigate = useNavigate()
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await supabase.auth.signInWithPassword(values)
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    navigate(next, { replace: true })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}

function MagicLinkForm({ next }: { next: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<{ email: string }>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${next}`,
      },
    })
    if (error) {
      toast.error(
        /signups not allowed|not found/i.test(error.message)
          ? 'Não achamos uma conta com este e-mail. Peça um convite ao líder.'
          : errorMessage(error),
      )
      return
    }
    setSentTo(email)
  })

  if (sentTo) {
    return (
      <Alert>
        <MailCheck aria-hidden="true" />
        <AlertTitle>Confira seu e-mail</AlertTitle>
        <AlertDescription>
          Enviamos um link de acesso para <strong className="text-foreground">{sentTo}</strong>.
          Abra no mesmo aparelho para entrar.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        id="magic-email"
        label="E-mail"
        error={errors.email?.message}
        hint="Você recebe um link e entra sem precisar de senha."
      >
        <Input
          id="magic-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          {...form.register('email')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Enviando…' : 'Receber link de acesso'}
      </Button>
    </form>
  )
}
