import { Eye } from 'lucide-react'

import { useChurch } from '@/features/church/church-context'
import { cn } from '@/lib/utils'

/**
 * Chave "Equipe | Gestão" (só dono/líder): mostra o app como um integrante
 * comum vê, para conferir a experiência da equipe.
 */
export function ViewSwitch({ className }: { className?: string }) {
  const { canSwitchView, viewMode, setViewMode } = useChurch()
  if (!canSwitchView) return null
  return (
    <div
      role="group"
      aria-label="Ver o app como"
      className={cn(
        'bg-secondary flex shrink-0 rounded-full p-0.5 text-xs font-semibold',
        className,
      )}
    >
      {(
        [
          { value: 'team', label: 'Equipe' },
          { value: 'manage', label: 'Gestão' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={viewMode === opt.value}
          onClick={() => setViewMode(opt.value)}
          className={cn(
            'min-h-9 flex-1 rounded-full px-3 transition-colors',
            viewMode === opt.value
              ? opt.value === 'team'
                ? 'bg-info text-background'
                : 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Faixa enquanto a pessoa está na visão da equipe. */
export function TeamViewBanner() {
  const { canSwitchView, viewMode, setViewMode } = useChurch()
  if (!canSwitchView || viewMode !== 'team') return null
  return (
    <div className="border-info/50 bg-info/10 text-info flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-[13px]">
      <Eye className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        Você está vendo o app como a equipe vê. Nada muda para ninguém.
      </span>
      <button
        type="button"
        onClick={() => setViewMode('manage')}
        className="min-h-9 shrink-0 font-semibold underline"
      >
        Voltar para gestão
      </button>
    </div>
  )
}
