import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { useAuth } from '@/auth/auth-context'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { safeNext } from '@/lib/safe-next'

// Só entra logado; guarda a rota para voltar depois do login.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (!user) {
    const next = location.pathname + location.search
    return <Navigate to={`/entrar?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}

// Telas de login/cadastro: quem já está logado vai para o app.
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenLoader />
  if (user) {
    const next = new URLSearchParams(location.search).get('next')
    return <Navigate to={safeNext(next)} replace />
  }
  return <>{children}</>
}
