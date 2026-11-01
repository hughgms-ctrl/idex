import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { CircleAlert, MailCheck } from 'lucide-react'

import { useAuth } from '@/auth/auth-context'
import { AuthShell } from '@/components/AuthShell'
import { FormField } from '@/components/FormField'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { loginSchema, signUpSchema, type LoginInput, type SignUpInput } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

const STATUS_TEXT: Record<string, string> = {
  expired: 'Este convite expirou. Peça um novo link ao líder do ministério.',
  revoked: 'Este convite foi cancelado pelo líder.',
  used: 'Este convite já foi usado. Peça um novo link ao líder.',
  not_found: 'Convite não encontrado. Confira se o link está completo.',
}

export function InvitePage() {
  const { token = '' } = useParams()
  const { user, loading } = useAuth()
  // Depois de criar conta/entrar aqui mesmo, aceita o convite automaticamente.
  const [autoAccept, setAutoAccept] = useState<{ fullName?: string } | null>(null)

  const preview = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token })
      if (error) throw error
      return data[0] ?? null
    },
  })

  if (loading || preview.isPending) return <FullScreenLoader />

  if (preview.error || !preview.data || preview.data.status !== 'valid') {
    const status = preview.data?.status ?? 'not_found'
    return (
      <AuthShell title="Convite indisponível">
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Não foi possível usar este convite</AlertTitle>
          <AlertDescription>
            {preview.error ? errorMessage(preview.error) : STATUS_TEXT[status]}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/">Ir para o início</Link>
        </Button>
      </AuthShell>
    )
  }

  const invite = preview.data
  const support = invite.kind === 'support'
  return (
    <AuthShell
      title={support ? `Acompanhar o ${invite.ministry_name}` : `Entrar no ${invite.ministry_name}`}
      subtitle={
        <div className="flex flex-col gap-2">
          {support ? (
            <span>
              Você foi convidado como apoio do{' '}
              <strong className="text-foreground">{invite.ministry_name}</strong> da{' '}
              <strong className="text-foreground">{invite.church_name}</strong>: horários dos cultos
              e ensaios, equipe e setlist com as cifras no tom do culto.
            </span>
          ) : (
            <span>
              Você foi convidado para a equipe de{' '}
              <strong className="text-foreground">{invite.ministry_name}</strong> da{' '}
              <strong className="text-foreground">{invite.church_name}</strong>.
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2">
            {invite.role === 'leader' && <Badge>Como líder</Badge>}
            {support && invite.support_label && <Badge>Apoio · {invite.support_label}</Badge>}
            <span className="text-xs">Válido até {formatDateTime(invite.expires_at)}</span>
          </span>
        </div>
      }
    >
      {user ? (
        <AcceptAsLoggedUser token={token} autoAccept={autoAccept} />
      ) : (
        <AuthThenAccept onAuthed={setAutoAccept} />
      )}
    </AuthShell>
  )
}

function useAcceptInvite(token: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (fullName?: string) => {
      const { data, error } = await supabase.rpc('accept_invite', {
        p_token: token,
        ...(fullName ? { p_full_name: fullName } : {}),
      })
      if (error) throw error
      return data as {
        church_id: string
        ministry_id: string
        already_member: boolean
        kind?: 'member' | 'support'
      }
    },
    onSuccess: async (result) => {
      try {
        localStorage.setItem('idex.churchId', result.church_id)
        localStorage.setItem('idex.ministryId', result.ministry_id)
      } catch {
        // ignora
      }
      await queryClient.invalidateQueries()
      if (result.kind === 'support') {
        toast.success(result.already_member ? 'Você já acompanha este ministério.' : 'Bem-vindo!')
        navigate('/apoio', { replace: true })
        return
      }
      toast.success(
        result.already_member ? 'Você já faz parte desta equipe.' : 'Bem-vindo à equipe!',
      )
      // primeira vez: escolher funções e responder a disponibilidade
      navigate(result.already_member ? '/' : '/minhas-funcoes?inicio=1', { replace: true })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

type AutoAccept = { fullName?: string } | null
type OnAuthed = (value: { fullName?: string }) => void

function AcceptAsLoggedUser({ token, autoAccept }: { token: string; autoAccept: AutoAccept }) {
  const { user } = useAuth()
  const accept = useAcceptInvite(token)
  const started = useRef(false)
  const { mutate } = accept

  useEffect(() => {
    if (autoAccept && !started.current) {
      started.current = true
      mutate(autoAccept.fullName)
    }
  }, [autoAccept, mutate])
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Conectado como <strong className="text-foreground">{user?.email}</strong>.
      </p>
      <Button size="lg" onClick={() => accept.mutate(undefined)} disabled={accept.isPending}>
        {accept.isPending ? 'Entrando…' : 'Aceitar convite'}
      </Button>
      <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
        Usar outra conta
      </Button>
    </div>
  )
}

function AuthThenAccept({ onAuthed }: { onAuthed: OnAuthed }) {
  return (
    <Tabs defaultValue="nova">
      <TabsList>
        <TabsTrigger value="nova">Criar conta</TabsTrigger>
        <TabsTrigger value="existente">Já tenho conta</TabsTrigger>
      </TabsList>
      <TabsContent value="nova">
        <SignUpAndAccept onAuthed={onAuthed} />
      </TabsContent>
      <TabsContent value="existente">
        <LoginAndAccept onAuthed={onAuthed} />
      </TabsContent>
    </Tabs>
  )
}

function SignUpAndAccept({ onAuthed }: { onAuthed: OnAuthed }) {
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName },
        // volta para esta mesma página de convite depois de confirmar o e-mail
        emailRedirectTo: window.location.href,
      },
    })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    if (!data.session) {
      setConfirmEmail(values.email)
      return
    }
    onAuthed({ fullName: values.fullName })
  })

  if (confirmEmail) {
    return (
      <Alert>
        <MailCheck aria-hidden="true" />
        <AlertTitle>Confirme seu e-mail</AlertTitle>
        <AlertDescription>
          Enviamos um link para <strong className="text-foreground">{confirmEmail}</strong>. Depois
          de confirmar, você volta para esta tela e aceita o convite.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
      <FormField id="password" label="Crie uma senha" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando…' : 'Criar conta e entrar'}
      </Button>
    </form>
  )
}

function LoginAndAccept({ onAuthed }: { onAuthed: OnAuthed }) {
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
    onAuthed({})
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField id="login-email" label="E-mail" error={errors.email?.message}>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          {...form.register('email')}
        />
      </FormField>
      <FormField id="login-password" label="Senha" error={errors.password?.message}>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando…' : 'Entrar e aceitar'}
      </Button>
    </form>
  )
}
