import { cn } from '@/lib/utils'

import type { AvailabilityAnswerKind, AvailabilityFilterValue } from './availability-filter'

const OPTIONS: { value: AvailabilityFilterValue; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'yes', label: 'Disponível' },
  { value: 'no', label: 'Indisponível' },
  { value: 'none', label: 'Sem resposta' },
]

/** Botões Todos · Disponível · Indisponível · Sem resposta, com a contagem de cada um. */
export function AvailabilityFilter({
  value,
  onChange,
  kinds,
  className,
}: {
  value: AvailabilityFilterValue
  onChange: (value: AvailabilityFilterValue) => void
  kinds: AvailabilityAnswerKind[]
  className?: string
}) {
  const count = (v: AvailabilityFilterValue) =>
    v === 'all' ? kinds.length : kinds.filter((k) => k === v).length
  return (
    <div
      role="radiogroup"
      aria-label="Filtrar por disponibilidade"
      className={cn('-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1', className)}
    >
      {OPTIONS.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? o.value === 'no'
                  ? 'border-destructive bg-destructive text-white'
                  : o.value === 'none'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground',
            )}
          >
            {o.label}
            <span className={cn('font-mono text-xs', !active && 'opacity-70')}>
              {count(o.value)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
