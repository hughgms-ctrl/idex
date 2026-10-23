import { NavLink, Outlet, useMatch } from 'react-router'
import { CalendarRange } from 'lucide-react'

import { AccountMenu } from '@/components/layout/AccountMenu'
import { NAV_ITEMS } from '@/components/layout/nav-items'
import { Logo } from '@/components/Logo'
import { InstallBanner } from '@/components/pwa/InstallBanner'
import { useChurch } from '@/features/church/church-context'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const { church, ministry, isLeader } = useChurch()
  const wide = useMatch('/planejamento')

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
            </NavLink>
          ))}
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
        </nav>
        <div className="mt-auto">
          <AccountMenu variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho (celular) */}
        <header className="flex items-center justify-between px-5 pt-[max(1.5rem,env(safe-area-inset-top))] md:hidden">
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
            'mx-auto flex w-full flex-1 flex-col gap-5 px-5 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10',
            wide ? 'max-w-6xl' : 'max-w-3xl',
          )}
        >
          <InstallBanner />
          <Outlet />
        </main>

        {/* Barra inferior (celular) */}
        <nav
          aria-label="Navegação principal"
          className="bg-nav fixed inset-x-0 bottom-0 z-40 flex justify-around border-t px-2 pt-2 pb-[max(1.375rem,env(safe-area-inset-bottom))] md:hidden"
        >
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              <Icon className="size-[22px]" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
