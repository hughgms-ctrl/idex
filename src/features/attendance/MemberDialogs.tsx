import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { attendanceKeys } from '@/features/attendance/queries'
import { fromLocalInputs, toLocalInputs } from '@/features/schedule/datetime'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type EventInfo = { id: string; title: string; starts_at: string }

/** "Esqueci de registrar": horário declarado + motivo. */
export function ForgotDialog({ event, onClose }: { event: EventInfo | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const initial = event ? toLocalInputs(event.starts_at) : { date: '', time: '' }
  const [time, setTime] = useState(initial.time)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!event) return
      const { error: err } = await supabase.rpc('create_checkin_request', {
        p_event_id: event.id,
        p_declared_arrived_at: fromLocalInputs(initial.date, time).toISOString(),
        p_reason: reason,
      })
      if (err) throw err
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
      toast.success('Pedido enviado ao líder')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Esqueci de registrar</DialogTitle>
          <DialogDescription>
            {event && `${event.title} · ${formatEventDate(event.starts_at)}`}. O líder confere e
            aprova.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField id="forgot-time" label="Que horas você chegou?">
            <Input
              id="forgot-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </FormField>
          <FormField id="forgot-reason" label="O que aconteceu?">
            <Input
              id="forgot-reason"
              value={reason}
              maxLength={300}
              placeholder="Ex.: celular sem bateria"
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || reason.trim().length < 3}
          >
            {save.isPending ? 'Enviando…' : 'Enviar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Justificativa antes do evento (falta ou atraso). */
export function JustifyDialog({
  event,
  churchId,
  memberId,
  initialKind = 'late',
  onClose,
}: {
  event: EventInfo | null
  churchId: string
  memberId: string
  initialKind?: 'late' | 'absence'
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'late' | 'absence'>(initialKind)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!event) return
      const { error: err } = await supabase.from('justifications').insert({
        church_id: churchId,
        event_id: event.id,
        ministry_member_id: memberId,
        kind,
        reason: reason.trim(),
      })
      if (err) throw err
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
      toast.success('Aviso enviado ao líder')
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avisar o líder</DialogTitle>
          <DialogDescription>
            {event && `${event.title} · ${formatEventDate(event.starts_at)}`}. Você continua na
            escala. Se o líder aprovar, não perde pontos (se o desconto já tiver caído, os pontos
            voltam).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FormField id="just-kind" label="O que vai acontecer?">
            <NativeSelect
              id="just-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="late">Vou me atrasar</option>
              <option value="absence">Não vou conseguir ir</option>
            </NativeSelect>
          </FormField>
          <FormField id="just-reason" label="Motivo">
            <Input
              id="just-reason"
              value={reason}
              maxLength={300}
              placeholder="Ex.: plantão no trabalho"
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || reason.trim().length < 3}
          >
            {save.isPending ? 'Enviando…' : 'Enviar aviso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
