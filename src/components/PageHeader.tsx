import type { ReactNode } from 'react'

export function PageHeader({
  title,
  eyebrow,
  description,
  action,
}: {
  title: string
  eyebrow?: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && (
          <span className="text-primary text-xs font-semibold tracking-wider">{eyebrow}</span>
        )}
        <h1 className="font-display text-[28px] leading-tight font-bold">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {action}
    </header>
  )
}
