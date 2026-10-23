import { Loader2 } from 'lucide-react'

export function FullScreenLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="text-muted-foreground flex min-h-dvh flex-col items-center justify-center gap-3">
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
