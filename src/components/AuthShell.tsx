import type { ReactNode } from 'react'

import { Logo } from '@/components/Logo'

// Moldura das telas públicas (login, cadastro, convite), pensada para 390px.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <header className="flex items-center justify-between">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[28px] leading-tight font-medium">{title}</h1>
          {subtitle && <div className="text-muted-foreground text-sm">{subtitle}</div>}
        </div>
        {children}
      </main>
      {footer && <footer className="mx-auto w-full max-w-md text-center text-sm">{footer}</footer>}
    </div>
  )
}
