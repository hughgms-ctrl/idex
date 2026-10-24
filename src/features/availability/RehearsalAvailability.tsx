import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  REHEARSAL_STATUS_LABEL,
  useSetRehearsalAvailability,
  type RehearsalAnswer,
  type RehearsalStatus,
} from '@/features/availability/queries'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

const OPTIONS: RehearsalStatus[] = ['any', 'some', 'none']

/**
 * "Para o ensaio deste culto": qualquer dia, só alguns (com observação) ou
 * nenhum. Fica no culto, então vale mesmo se o ensaio for remarcado.
 */
export function RehearsalAvailabilityField({
  serviceId,
  answer,
  memberId,
  churchId,
}: {
  serviceId: string
  answer: RehearsalAnswer | undefined
  memberId: string
  churchId: string
}) {
  const save = useSetRehearsalAvailability(memberId, churchId)
  const [note, setNote] = useState(answer?.note ?? '')
  const status = answer?.status ?? null
  const id = `ensaio-${serviceId}`
  const noteChanged = note.trim() !== (answer?.note ?? '')

  const send = (next: RehearsalStatus | null, nextNote: string) =>
    save.mutate(
      { serviceId, status: next, note: nextNote },
      {
        onSuccess: () => {
          if (next && nextNote !== (answer?.note ?? '')) toast.success('Observação salva')
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    )

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-info text-[13px] font-semibold">
        Nesta semana, posso ensaiar em:
      </span>
      <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={status === o}
            disabled={save.isPending}
            onClick={() => send(status === o ? null : o, status === o ? '' : note)}
            className={cn(
              'min-h-11 rounded-xl border px-1 text-[13px] font-semibold',
              status === o
                ? o === 'none'
                  ? 'border-destructive bg-destructive text-white'
                  : 'border-info bg-info text-background'
                : 'text-muted-foreground',
            )}
          >
            {REHEARSAL_STATUS_LABEL[o]}
          </button>
        ))}
      </div>
      {status && (
        <div className="flex gap-2">
          <Input
            aria-label="Observação sobre o ensaio"
            value={note}
            maxLength={300}
            placeholder={
              status === 'none'
                ? 'Ex.: viajando a semana toda'
                : status === 'some'
                  ? 'Ex.: só terça; quarta não'
                  : 'Observação (opcional)'
            }
            onChange={(e) => setNote(e.target.value)}
          />
          {noteChanged && (
            <Button
              size="sm"
              className="min-h-10"
              disabled={save.isPending}
              onClick={() => send(status, note)}
            >
              Salvar
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
