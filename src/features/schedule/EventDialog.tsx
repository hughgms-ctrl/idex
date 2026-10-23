import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { buildWeeklyRule, weeklyOccurrences } from '@domain/schedule.ts'
import { addDaysToKey, localParts } from '@domain/time.ts'

import { useUser } from '@/auth/auth-context'
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
import { NativeSelect } from '@/components/ui/native-select'
import { fromLocalInputs, toLocalInputs } from '@/features/schedule/datetime'
import { scheduleKeys, type ScheduleEvent } from '@/features/schedule/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

const schema = z
  .object({
    kind: z.enum(['service', 'rehearsal', 'other']),
    title: z.string().trim().min(1, { message: 'Informe o nome' }).max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data' }),
    time: z.string().regex(/^\d{2}:\d{2}$/, { message: 'Informe o horário' }),
    durationMin: z.number().int().min(15).max(720),
    location: z.string().trim().max(120),
    repeat: z.boolean(),
    repeatUntil: z.string(),
  })
  .refine((v) => !v.repeat || /^\d{4}-\d{2}-\d{2}$/.test(v.repeatUntil), {
    message: 'Informe até quando repete',
    path: ['repeatUntil'],
  })
  .refine((v) => !v.repeat || v.repeatUntil >= v.date, {
    message: 'A data final precisa ser depois da primeira',
    path: ['repeatUntil'],
  })
type Values = z.infer<typeof schema>

const DURATIONS: [number, string][] = [
  [60, '1 hora'],
  [90, '1h30'],
  [120, '2 horas'],
  [150, '2h30'],
  [180, '3 horas'],
  [240, '4 horas'],
]

const DEFAULT_TITLE: Record<Values['kind'], string> = {
  service: 'Culto',
  rehearsal: 'Ensaio',
  other: 'Evento',
}

export function EventDialog({
  open,
  onOpenChange,
  ministry,
  event,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ministry: Tables<'ministries'>
  event?: ScheduleEvent | null
  defaultDate?: string
}) {
  const user = useUser()
  const queryClient = useQueryClient()
  const editing = Boolean(event)
  const initial = event ? toLocalInputs(event.starts_at) : null
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      kind: (event?.kind as Values['kind'] | undefined) ?? 'service',
      title: event?.title ?? 'Culto',
      date: initial?.date ?? defaultDate ?? '',
      time: initial?.time ?? '19:00',
      durationMin: event?.ends_at
        ? Math.round(
            (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60_000,
          )
        : 120,
      location: event?.location_name ?? '',
      repeat: false,
      repeatUntil: '',
    },
  })
  const { errors } = form.formState
  const repeat = useWatch({ control: form.control, name: 'repeat' })

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const base = {
        church_id: ministry.church_id,
        ministry_id: ministry.id,
        kind: v.kind,
        title: v.title,
        location_name: v.location || null,
      }
      const withTimes = (start: Date) => ({
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + v.durationMin * 60_000).toISOString(),
      })
      if (event) {
        const { error } = await supabase
          .from('events')
          .update({ ...base, ...withTimes(fromLocalInputs(v.date, v.time)) })
          .eq('id', event.id)
        if (error) throw error
        return 1
      }
      if (!v.repeat) {
        const { error } = await supabase
          .from('events')
          .insert({ ...base, ...withTimes(fromLocalInputs(v.date, v.time)), created_by: user.id })
        if (error) throw error
        return 1
      }
      const dates = weeklyOccurrences({ firstDate: v.date, time: v.time, untilDate: v.repeatUntil })
      const [first, ...rest] = dates
      if (!first) return 0
      const weekday = localParts(first).weekday
      const { data: parent, error } = await supabase
        .from('events')
        .insert({
          ...base,
          ...withTimes(first),
          recurrence_rule: buildWeeklyRule([weekday]),
          created_by: user.id,
        })
        .select('id')
        .single()
      if (error) throw error
      if (rest.length > 0) {
        const { error: err } = await supabase.from('events').insert(
          rest.map((d) => ({
            ...base,
            ...withTimes(d),
            recurrence_parent_id: parent.id,
            created_by: user.id,
          })),
        )
        if (err) throw err
      }
      return dates.length
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
      toast.success(
        editing ? 'Evento atualizado' : count > 1 ? `${count} eventos criados` : 'Evento criado',
      )
      onOpenChange(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const date = useWatch({ control: form.control, name: 'date' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar evento' : 'Novo culto ou ensaio'}</DialogTitle>
          <DialogDescription>Horários no fuso de Brasília.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormField id="event-kind" label="Tipo">
            <NativeSelect
              id="event-kind"
              {...form.register('kind', {
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                  const kind = e.target.value as Values['kind']
                  const title = form.getValues('title')
                  if (Object.values(DEFAULT_TITLE).includes(title)) {
                    form.setValue('title', DEFAULT_TITLE[kind])
                  }
                },
              })}
            >
              <option value="service">Culto</option>
              <option value="rehearsal">Ensaio</option>
              <option value="other">Outro</option>
            </NativeSelect>
          </FormField>
          <FormField id="event-title" label="Nome" error={errors.title?.message}>
            <Input id="event-title" {...form.register('title')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="event-date" label="Data" error={errors.date?.message}>
              <Input id="event-date" type="date" {...form.register('date')} />
            </FormField>
            <FormField id="event-time" label="Horário" error={errors.time?.message}>
              <Input id="event-time" type="time" {...form.register('time')} />
            </FormField>
          </div>
          <FormField id="event-duration" label="Duração">
            <NativeSelect
              id="event-duration"
              {...form.register('durationMin', { valueAsNumber: true })}
            >
              {DURATIONS.map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="event-location" label="Local (opcional)">
            <Input
              id="event-location"
              placeholder="Ex.: Sala da banda"
              {...form.register('location')}
            />
          </FormField>
          {!editing && (
            <div className="flex flex-col gap-3 rounded-xl border p-3">
              <Label className="min-h-11 cursor-pointer font-normal">
                <Checkbox
                  checked={repeat}
                  onCheckedChange={(v) => {
                    form.setValue('repeat', v === true)
                    if (v === true && !form.getValues('repeatUntil') && date) {
                      form.setValue('repeatUntil', addDaysToKey(date, 7 * 12))
                    }
                  }}
                />
                Repetir toda semana
              </Label>
              {repeat && (
                <FormField id="event-until" label="Até" error={errors.repeatUntil?.message}>
                  <Input id="event-until" type="date" {...form.register('repeatUntil')} />
                </FormField>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
