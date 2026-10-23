import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { buildWeeklyRule } from '@domain/schedule.ts'
import { addDaysToKey, localDateKey } from '@domain/time.ts'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fromLocalInputs, WEEKDAY_SHORT } from '@/features/schedule/datetime'
import { scheduleKeys } from '@/features/schedule/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export function UnavailabilityDialog({
  open,
  onOpenChange,
  churchId,
  ministryId,
  memberId,
  memberName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
  ministryId: string
  memberId: string
  memberName?: string
}) {
  const queryClient = useQueryClient()
  const today = localDateKey(new Date())
  const [mode, setMode] = useState<'periodo' | 'semanal'>('periodo')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [until, setUntil] = useState(addDaysToKey(today, 90))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const end = mode === 'periodo' ? to : until
      if (!from || !end || end < from)
        throw new Error('A data final precisa ser igual ou depois da inicial.')
      if (mode === 'semanal' && weekdays.length === 0)
        throw new Error('Escolha pelo menos um dia da semana.')
      const { error: err } = await supabase.from('member_unavailability').insert({
        church_id: churchId,
        ministry_member_id: memberId,
        starts_at: fromLocalInputs(from, '00:00').toISOString(),
        ends_at: fromLocalInputs(addDaysToKey(end, 1), '00:00').toISOString(),
        recurrence_rule: mode === 'semanal' ? buildWeeklyRule(weekdays) : null,
        reason: reason.trim() || null,
      })
      if (err) throw err
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.unavailability(ministryId) })
      toast.success('Indisponibilidade registrada')
      setError(null)
      setReason('')
      onOpenChange(false)
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar indisponível</DialogTitle>
          <DialogDescription>
            {memberName ? `${memberName} não` : 'Você não'} entra na escala nesses dias. Só o líder
            vê o motivo.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList>
            <TabsTrigger value="periodo">Dia ou período</TabsTrigger>
            <TabsTrigger value="semanal">Toda semana</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-4">
          {mode === 'semanal' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Dias da semana</legend>
              <div className="grid grid-cols-4 gap-1">
                {WEEKDAY_SHORT.map((label, day) => (
                  <Label
                    key={label}
                    className="hover:bg-secondary min-h-11 cursor-pointer rounded-lg px-2 font-normal"
                  >
                    <Checkbox
                      checked={weekdays.includes(day)}
                      onCheckedChange={(v) =>
                        setWeekdays((d) => (v ? [...d, day] : d.filter((x) => x !== day)))
                      }
                    />
                    {label}
                  </Label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField id="unav-from" label={mode === 'periodo' ? 'De' : 'A partir de'}>
              <Input
                id="unav-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FormField>
            {mode === 'periodo' ? (
              <FormField id="unav-to" label="Até">
                <Input
                  id="unav-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </FormField>
            ) : (
              <FormField id="unav-until" label="Até">
                <Input
                  id="unav-until"
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </FormField>
            )}
          </div>
          <FormField id="unav-reason" label="Motivo (opcional)">
            <Input
              id="unav-reason"
              value={reason}
              maxLength={200}
              placeholder="Ex.: viagem, plantão"
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
