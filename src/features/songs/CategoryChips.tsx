import { Check } from 'lucide-react'

import type { SongCategory } from '@/features/songs/categories'
import { cn } from '@/lib/utils'

/** Botões para marcar os tipos de uma música (pode marcar mais de um). */
export function CategoryChips({
  categories,
  value,
  onChange,
  disabled,
  label,
}: {
  categories: SongCategory[]
  value: readonly string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <div role="group" aria-label={label ?? 'Tipos da música'} className="flex flex-wrap gap-1.5">
      {categories.map((c) => {
        const on = value.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            className={cn(
              'flex min-h-9 items-center gap-1 rounded-full border px-3 text-[13px] transition-colors',
              on
                ? 'border-primary bg-primary/15 text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {on && <Check className="size-3.5" aria-hidden="true" />}
            {c.name}
          </button>
        )
      })}
    </div>
  )
}
