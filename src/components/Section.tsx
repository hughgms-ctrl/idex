import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Cartão escuro dos protótipos (fundo #17191E, borda #262932, cantos 16–20px)
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('bg-card flex flex-col gap-3 rounded-2xl border p-4', className)}>
      {children}
    </section>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {action}
    </div>
  )
}
