import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'

import { RedirectIfAuthed, RequireAuth } from '@/auth/guards'
import { AppLayout } from '@/components/layout/AppLayout'
import { ChurchProvider } from '@/features/church/ChurchProvider'
import { InvitePage } from '@/pages/auth/InvitePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignUpChurchPage } from '@/pages/auth/SignUpChurchPage'
import { WelcomePage } from '@/pages/auth/WelcomePage'
import { CreateChurchPage } from '@/pages/CreateChurchPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { EventSchedulePage } from '@/pages/EventSchedulePage'
import { MembersPage } from '@/pages/MembersPage'
import { MinistriesPage } from '@/pages/MinistriesPage'
import { PresencePage } from '@/pages/PresencePage'
import { RepertoirePage } from '@/pages/RepertoirePage'
import { SchedulePage } from '@/pages/SchedulePage'
import { SetlistPage } from '@/pages/SetlistPage'
import { SettingsPage } from '@/pages/SettingsPage'

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
        // tela cheia, sem menu
        path: 'presenca/qr/:eventId',
        lazy: () =>
          import('@/pages/attendance/QrDisplayPage').then((m) => ({ Component: m.QrDisplayPage })),
      },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'escalas', element: <SchedulePage /> },
          { path: 'escalas/:eventId', element: <EventSchedulePage /> },
          { path: 'repertorio', element: <RepertoirePage /> },
          { path: 'repertorio/culto/:eventId', element: <SetlistPage /> },
          {
            path: 'repertorio/nova',
            lazy: () =>
              import('@/pages/songs/SongEditorPage').then((m) => ({ Component: m.SongEditorPage })),
          },
          {
            path: 'repertorio/:songId/editar',
            lazy: () =>
              import('@/pages/songs/SongEditorPage').then((m) => ({ Component: m.SongEditorPage })),
          },
          {
            path: 'repertorio/:songId',
            lazy: () => import('@/pages/songs/SongPage').then((m) => ({ Component: m.SongPage })),
          },
          { path: 'presenca', element: <PresencePage /> },
          {
            path: 'presenca/checkin',
            lazy: () =>
              import('@/pages/attendance/CheckinPage').then((m) => ({ Component: m.CheckinPage })),
          },
          { path: 'configuracoes', element: <SettingsPage /> },
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
