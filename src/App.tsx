import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router'

import { RedirectIfAuthed, RequireAuth } from '@/auth/guards'
import { AppLayout } from '@/components/layout/AppLayout'
import { ChurchProvider } from '@/features/church/ChurchProvider'
import { InvitePage } from '@/pages/auth/InvitePage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignUpChurchPage } from '@/pages/auth/SignUpChurchPage'
import { WelcomePage } from '@/pages/auth/WelcomePage'
import { AvailabilityPage } from '@/pages/AvailabilityPage'
import { ConfirmPage } from '@/pages/ConfirmPage'
import { CreateChurchPage } from '@/pages/CreateChurchPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { InstallPage } from '@/pages/InstallPage'
import { EventSchedulePage } from '@/pages/EventSchedulePage'
import { MembersPage } from '@/pages/MembersPage'
import { MinistriesPage } from '@/pages/MinistriesPage'
import { MyRolesPage } from '@/pages/MyRolesPage'
import { PlanningPage } from '@/pages/PlanningPage'
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
        // QR fixo do ministério (tela cheia, para imprimir)
        path: 'presenca/qr-fixo',
        lazy: () =>
          import('@/pages/attendance/FixedQrPage').then((m) => ({ Component: m.FixedQrPage })),
      },
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
          { path: 'confirmar/:eventId', element: <ConfirmPage /> },
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
            path: 'repertorio/:songId/audios',
            lazy: () =>
              import('@/pages/songs/AudiosPage').then((m) => ({ Component: m.AudiosPage })),
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
          {
            // QR lido pela câmera do celular (fora do app)
            path: 'ponto',
            lazy: () =>
              import('@/pages/attendance/CheckinPage').then((m) => ({ Component: m.CheckinPage })),
          },
          { path: 'configuracoes', element: <SettingsPage /> },
          { path: 'minhas-funcoes', element: <MyRolesPage /> },
          { path: 'disponibilidade', element: <AvailabilityPage /> },
          { path: 'instalar', element: <InstallPage /> },
          { path: 'planejamento', element: <PlanningPage /> },
          { path: 'membros', element: <MembersPage /> },
          { path: 'ministerios', element: <MinistriesPage /> },
          {
            path: 'avisos',
            lazy: () =>
              import('@/pages/AnnouncementsPage').then((m) => ({
                Component: m.AnnouncementsPage,
              })),
          },
          {
            path: 'conversas',
            lazy: () =>
              import('@/pages/ConversationsPage').then((m) => ({
                Component: m.ConversationsPage,
              })),
          },
          {
            path: 'conversas/:conversationId',
            lazy: () =>
              import('@/pages/ConversationPage').then((m) => ({ Component: m.ConversationPage })),
          },
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
