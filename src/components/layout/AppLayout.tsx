import { NavLink, Outlet, useMatch } from 'react-router'
import { BellRing, CalendarCheck, CalendarRange } from 'lucide-react'

import { AccountMenu } from '@/components/layout/AccountMenu'
import { NAV_ITEMS } from '@/components/layout/nav-items'
import { Logo } from '@/components/Logo'
import { InstallBanner } from '@/components/pwa/InstallBanner'
import { useMarkAppInstalled } from '@/components/pwa/mark-installed'
import { useChurch } from '@/features/church/church-context'
import { totalUnread, unreadLabel } from '@/features/chat/chat'
import { useChatRealtime, useConversations } from '@/features/chat/queries'
import { SetupPrompt } from '@/features/push/SetupPrompt'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { church, ministry, memberships, isLeader, can } = useChurch()
  const wide = useMatch('/planejamento')
  // conversa aberta: tela cheia no celular (sem cabeçalho nem barra de baixo)
  const thread = useMatch('/conversas/:conversationId')
  useMarkAppInstalled()
  useChatRealtime(church.id)
  const conversations = useConversations(church.id)
  const unread = totalUnread(conversations.data ?? [])
  const badge = (to: string) =>
    to === '/conversas' && unread > 0 ? (
      <span
        className="bg-primary text-primary-foreground flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold"
        aria-label={`${unread} mensagens sem ler`}
      >
        {unreadLabel(unread)}
      </span>
    ) : null

  return (
    <div className="flex min-h-dvh">
      {/* Menu lateral (tablet/computador) */}
      <aside className="bg-nav sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r px-4 py-6 md:flex">
        <div className="flex flex-col gap-1 px-2">
          <Logo />
          <span className="text-muted-foreground truncate text-[13px]">
            {ministry?.name ?? 'Ministério'} · {church.name}
          </span>
        </div>
        <nav aria-label="Navegação principal" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
              <span className="ml-auto">{badge(to)}</span>
            </NavLink>
          ))}
          {ministry && memberships.some((m) => m.ministry_id === ministry.id) && (
            <NavLink
              to="/disponibilidade"
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <CalendarCheck className="size-5" aria-hidden="true" />
              Minha disponibilidade
            </NavLink>
          )}
          {ministry && isLeader(ministry.id) && (
            <NavLink
              to="/planejamento"
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <CalendarRange className="size-5" aria-hidden="true" />
              Planejamento
            </NavLink>
          )}
          {ministry && can(ministry.id, 'announcements') && (
            <NavLink
              to="/avisos"
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <BellRing className="size-5" aria-hidden="true" />
              Avisos
            </NavLink>
          )}
        </nav>
        <div className="mt-auto">
          <AccountMenu variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho (celular) */}
        <header
          className={cn(
            'flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] md:hidden',
            thread && 'hidden',
          )}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <Logo />
            <span className="text-muted-foreground truncate text-[13px]">
              {ministry?.name ?? 'Ministério'} · {church.name}
            </span>
          </div>
          <AccountMenu variant="header" />
        </header>

        <main
          className={cn(
            'mx-auto flex w-full flex-col',
            // conversa: altura fixa da tela (flex-1 deixaria crescer com as mensagens
            // e a caixa de digitar sumiria lá embaixo)
            thread
              ? 'h-dvh max-h-dvh max-w-3xl flex-none overflow-hidden md:px-8 md:pt-6'
              : 'flex-1 gap-5 px-5 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10',
            !thread && (wide ? 'max-w-6xl' : 'max-w-3xl'),
          )}
        >
          {!thread && <InstallBanner />}
          {!thread && <SetupPrompt />}
          <Outlet />
        </main>

        {/* Barra inferior (celular) */}
        <nav
          aria-label="Navegação principal"
          className={cn(
            'bg-nav fixed inset-x-0 bottom-0 z-40 flex justify-around border-t px-1 pt-2 pb-[max(1.375rem,env(safe-area-inset-bottom))] md:hidden',
            thread && 'hidden',
          )}
        >
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-[22px]" aria-hidden="true" />
              <span className="absolute -top-1 left-1/2 ml-1.5">{badge(to)}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
