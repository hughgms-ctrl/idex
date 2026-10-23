import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Link2 } from 'lucide-react'

import { useUser } from '@/auth/auth-context'
import { AuthShell } from '@/components/AuthShell'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ChurchForm } from '@/features/church/ChurchForm'
import { readPendingChurch } from '@/features/church/pending-church'
import { useMyChurches } from '@/features/church/queries'
import { useCreateChurch } from '@/features/church/useCreateChurch'
import { errorMessage } from '@/lib/errors'
import type { ChurchInput } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

// Pessoa logada que ainda não participa de nenhuma igreja.
export function WelcomePage() {
  const user = useUser()
  const churches = useMyChurches(user.id)
  const navigate = useNavigate()
  const createChurch = useCreateChurch()

  if (churches.isPending) return <FullScreenLoader />
  if (churches.data && churches.data.length > 0) return <Navigate to="/" replace />

  const onSubmit = async (values: ChurchInput) => {
    try {
      await createChurch.mutateAsync(values)
      toast.success('Igreja cadastrada! Agora convide sua equipe.')
      navigate('/membros', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const name = (user.user_metadata as { full_name?: string }).full_name?.split(' ')[0]

  return (
    <AuthShell
      title={name ? `Olá, ${name}.` : 'Bem-vindo!'}
      subtitle="Você ainda não participa de nenhuma igreja no ide.x."
      footer={
        <Button variant="ghost" onClick={() => void supabase.auth.signOut()}>
          Sair
        </Button>
      }
    >
      <Alert>
        <Link2 aria-hidden="true" />
        <AlertTitle>Recebeu um convite?</AlertTitle>
        <AlertDescription>
          Abra o link que o líder do ministério mandou para você entrar na equipe.
        </AlertDescription>
      </Alert>

      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-5">
        <h2 className="font-semibold">Ou cadastre sua igreja</h2>
        <ChurchForm defaultValues={readPendingChurch()} onSubmit={onSubmit} />
      </section>
    </AuthShell>
  )
}
