import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'
import { CalendarDays, UserCheck } from 'lucide-react'

import { RedirectIfAuthed, RequireAuth } from '@/auth/guards'
import { AppLayout } from '@/components/layout/AppLayout'
import { ChurchProvider } from '@/features/church/ChurchProvider'
import { InvitePage } from '@/pages/auth/InvitePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignUpChurchPage } from '@/pages/auth/SignUpChurchPage'
import { WelcomePage } from '@/pages/auth/WelcomePage'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { CreateChurchPage } from '@/pages/CreateChurchPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MembersPage } from '@/pages/MembersPage'
import { MinistriesPage } from '@/pages/MinistriesPage'
import { RepertoirePage } from '@/pages/RepertoirePage'

const router = createBrowserRouter([
  {
    path: '/entrar',
    element: (
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    ),
  },
  {
    path: '/cadastro',
    element: (
      <RedirectIfAuthed>
        <SignUpChurchPage />
      </RedirectIfAuthed>
    ),
  },
  { path: '/convite/:token', element: <InvitePage /> },
  {
    path: '/bem-vindo',
    element: (
      <RequireAuth>
        <WelcomePage />
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <ChurchProvider>
          <Outlet />
        </ChurchProvider>
      </RequireAuth>
    ),
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          {
            path: 'escalas',
            element: (
              <ComingSoonPage
                title="Escala"
                icon={CalendarDays}
                phase="PRÓXIMA ETAPA"
                description="Calendário do mês, sua escala, indisponibilidade e sugestão de substituto."
              />
            ),
          },
          { path: 'repertorio', element: <RepertoirePage /> },
          {
            path: 'presenca',
            element: (
              <ComingSoonPage
                title="Presença"
                icon={UserCheck}
                phase="EM BREVE"
                description="Check-in pelo QR com localização, pontos do ciclo e pedidos de “esqueci de registrar”."
              />
            ),
          },
          { path: 'membros', element: <MembersPage /> },
          { path: 'ministerios', element: <MinistriesPage /> },
          { path: 'cadastro-igreja', element: <CreateChurchPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
