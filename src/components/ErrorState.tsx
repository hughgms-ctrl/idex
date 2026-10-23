import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="text-warning size-8" aria-hidden="true" />
      <p className="text-muted-foreground max-w-sm text-sm">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  )
}
