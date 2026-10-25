import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import {
  buildWeeklyRule,
  daysBetweenKeys,
  defaultArrival,
  defaultRehearsal,
  weeklyOccurrences,
} from '@domain/schedule.ts'
import { addDaysToKey, localDateKey, localParts } from '@domain/time.ts'

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
import { useMinistrySettings } from '@/features/ministries/queries'
import { fromLocalInputs, toLocalInputs, WEEKDAY_SHORT } from '@/features/schedule/datetime'
import { scheduleKeys, useLinkedRehearsal, type ScheduleEvent } from '@/features/schedule/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

const schema = z
  .object({
    kind: z.enum(['service', 'rehearsal', 'other']),
    title: z.string().trim().min(1, { message: 'Informe o nome' }).max(120),
    date: z.string().regex(DATE, { message: 'Informe a data' }),
    time: z.string().regex(TIME, { message: 'Informe o horário' }),
    arrival: z.string(),
    soundcheck: z.string(),
    durationMin: z.number().int().min(15).max(720),
    location: z.string().trim().max(120),
    repeat: z.boolean(),
    repeatUntil: z.string(),
    hasRehearsal: z.boolean(),
    rehearsalDate: z.string(),
    rehearsalTime: z.string(),
    rehearsalArrival: z.string(),
  })
  .refine((v) => !v.repeat || DATE.test(v.repeatUntil), {
    message: 'Informe até quando repete',
    path: ['repeatUntil'],
  })
  .refine((v) => !v.repeat || v.repeatUntil >= v.date, {
    message: 'A data final precisa ser depois da primeira',
    path: ['repeatUntil'],
  })
  .refine(
    (v) => v.kind === 'other' || !v.arrival || (TIME.test(v.arrival) && v.arrival <= v.time),
    {
      message: 'A chegada precisa ser antes do início',
      path: ['arrival'],
    },
  )
  .refine(
    (v) =>
      v.kind !== 'service' || !v.soundcheck || (TIME.test(v.soundcheck) && v.soundcheck <= v.time),
    { message: 'A passagem de som precisa ser antes do início', path: ['soundcheck'] },
  )
  .refine(
    (v) =>
      v.kind !== 'service' ||
      !v.hasRehearsal ||
      !v.rehearsalArrival ||
      (TIME.test(v.rehearsalArrival) && v.rehearsalArrival <= v.rehearsalTime),
    { message: 'A chegada precisa ser antes do início do ensaio', path: ['rehearsalArrival'] },
  )
  .refine(
    (v) =>
      v.kind !== 'service' ||
      !v.hasRehearsal ||
      (DATE.test(v.rehearsalDate) && TIME.test(v.rehearsalTime)),
    { message: 'Informe o dia e o horário do ensaio', path: ['rehearsalDate'] },
  )
  .refine(
    (v) =>
      v.kind !== 'service' ||
      !v.hasRehearsal ||
      `${v.rehearsalDate} ${v.rehearsalTime}` < `${v.date} ${v.time}`,
    { message: 'O ensaio precisa ser antes do culto', path: ['rehearsalDate'] },
  )
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

function weekdayLabel(dateKey: string): string {
  return DATE.test(dateKey) ? (WEEKDAY_SHORT[localParts(`${dateKey}T15:00:00Z`).weekday] ?? '') : ''
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
  const settings = useMinistrySettings(ministry.id).data
  const editing = Boolean(event)
  const rehearsal = useLinkedRehearsal(event?.kind === 'service' ? event.id : undefined).data
  const initial = event ? toLocalInputs(event.starts_at) : null
  const startTime = initial?.time ?? '19:00'
  const startDate = initial?.date ?? defaultDate ?? ''
  const arrivalMin = settings?.service_arrival_minutes ?? 30
  const rehearsalDefaults = {
    rehearsal_days_before: settings?.rehearsal_days_before ?? 3,
    rehearsal_time: settings?.rehearsal_time ?? '20:00',
    rehearsal_mode: settings?.rehearsal_mode ?? 'days_before',
    rehearsal_weekday: settings?.rehearsal_weekday ?? null,
  }
  const soundcheckMin = settings?.service_soundcheck_minutes ?? null
  const rehearsalArrivalMin = settings?.rehearsal_arrival_minutes ?? 20
  const initialArrivalOffset = event?.arrive_at
    ? Math.round(
        (new Date(event.starts_at).getTime() - new Date(event.arrive_at).getTime()) / 60_000,
      )
    : null
  const defaultRehearsalTime = rehearsalDefaults.rehearsal_time.slice(0, 5)
  const suggested = startDate ? defaultRehearsal(startDate, rehearsalDefaults) : null
  const existingRehearsal = rehearsal ? toLocalInputs(rehearsal.starts_at) : null

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      kind: (event?.kind as Values['kind'] | undefined) ?? 'service',
      title: event?.title ?? 'Culto',
      date: startDate,
      time: startTime,
      arrival: event
        ? event.arrive_at
          ? toLocalInputs(event.arrive_at).time
          : ''
        : defaultArrival(startTime, arrivalMin),
      soundcheck: event
        ? event.soundcheck_at
          ? toLocalInputs(event.soundcheck_at).time
          : ''
        : soundcheckMin != null
          ? defaultArrival(startTime, soundcheckMin)
          : '',
      durationMin: event?.ends_at
        ? Math.round(
            (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60_000,
          )
        : 120,
      location: event?.location_name ?? '',
      repeat: false,
      repeatUntil: '',
      hasRehearsal: event ? Boolean(rehearsal) : (settings?.rehearsal_enabled ?? true),
      rehearsalDate: existingRehearsal?.date ?? suggested?.date ?? '',
      rehearsalTime: existingRehearsal?.time ?? defaultRehearsalTime,
      rehearsalArrival: rehearsal
        ? rehearsal.arrive_at
          ? toLocalInputs(rehearsal.arrive_at).time
          : ''
        : defaultArrival(defaultRehearsalTime, rehearsalArrivalMin),
    },
  })
  const { errors } = form.formState
  const [kind, repeat, date, hasRehearsal, rehearsalDate] = useWatch({
    control: form.control,
    name: ['kind', 'repeat', 'date', 'hasRehearsal', 'rehearsalDate'],
  })
  const isService = kind === 'service'

  // Ao mudar data/horário do culto, ajusta chegada e ensaio que o líder não mexeu
  const onDateChange = (value: string) => {
    if (!form.getFieldState('rehearsalDate').isDirty && DATE.test(value)) {
      form.setValue('rehearsalDate', defaultRehearsal(value, rehearsalDefaults).date)
    }
  }
  const onTimeChange = (value: string) => {
    if (!form.getFieldState('arrival').isDirty && TIME.test(value)) {
      // mantém a mesma antecedência da chegada (ao remarcar, a chegada acompanha)
      const minutes =
        initialArrivalOffset ??
        (form.getValues('kind') === 'rehearsal' ? rehearsalArrivalMin : arrivalMin)
      form.setValue('arrival', defaultArrival(value, minutes))
    }
    if (!form.getFieldState('soundcheck').isDirty && TIME.test(value) && soundcheckMin != null) {
      form.setValue('soundcheck', defaultArrival(value, soundcheckMin))
    }
  }
  const onRehearsalTimeChange = (value: string) => {
    if (!form.getFieldState('rehearsalArrival').isDirty && TIME.test(value)) {
      form.setValue('rehearsalArrival', defaultArrival(value, rehearsalArrivalMin))
    }
  }

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const base = {
        church_id: ministry.church_id,
        ministry_id: ministry.id,
        kind: v.kind,
        title: v.title,
        location_name: v.location || null,
      }
      // horário "antes do início": conta em minutos (vale perto da meia-noite)
      const beforeStart = (start: Date, startTime: string, earlier: string) =>
        new Date(start.getTime() - minutesBefore(startTime, earlier) * 60_000).toISOString()
      const arrivalFor = (start: Date) =>
        v.kind !== 'other' && v.arrival ? beforeStart(start, v.time, v.arrival) : null
      const soundcheckFor = (start: Date) =>
        isServiceKind(v) && v.soundcheck ? beforeStart(start, v.time, v.soundcheck) : null
      const withTimes = (start: Date) => ({
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + v.durationMin * 60_000).toISOString(),
        arrive_at: arrivalFor(start),
        soundcheck_at: soundcheckFor(start),
      })
      // o ensaio fica a mesma distância (em dias) antes de cada culto
      const offsetDays =
        isServiceKind(v) && v.hasRehearsal ? daysBetweenKeys(v.rehearsalDate, v.date) : 0
      const rehearsalDuration = settings?.rehearsal_duration_min ?? 120
      const rehearsalRow = (serviceId: string, serviceStart: Date) => {
        const day = addDaysToKey(localDateKey(serviceStart), -offsetDays)
        const start = fromLocalInputs(day, v.rehearsalTime)
        return {
          church_id: ministry.church_id,
          ministry_id: ministry.id,
          kind: 'rehearsal' as const,
          title: `Ensaio · ${v.title}`,
          location_name: v.location || null,
          starts_at: start.toISOString(),
          ends_at: new Date(start.getTime() + rehearsalDuration * 60_000).toISOString(),
          arrive_at: v.rehearsalArrival
            ? beforeStart(start, v.rehearsalTime, v.rehearsalArrival)
            : null,
          service_event_id: serviceId,
          created_by: user.id,
        }
      }

      if (event) {
        const start = fromLocalInputs(v.date, v.time)
        const { error } = await supabase
          .from('events')
          .update({ ...base, ...withTimes(start) })
          .eq('id', event.id)
        if (error) throw error
        if (event.kind === 'service' || isServiceKind(v)) {
          if (isServiceKind(v) && v.hasRehearsal) {
            const row = rehearsalRow(event.id, start)
            const { error: err } = rehearsal
              ? await supabase
                  .from('events')
                  .update({
                    starts_at: row.starts_at,
                    ends_at: row.ends_at,
                    arrive_at: row.arrive_at,
                    title: row.title,
                  })
                  .eq('id', rehearsal.id)
              : await supabase.from('events').insert(row)
            if (err) throw err
          } else if (rehearsal) {
            const { error: err } = await supabase.from('events').delete().eq('id', rehearsal.id)
            if (err) throw err
          }
        }
        return 1
      }

      const dates = v.repeat
        ? weeklyOccurrences({ firstDate: v.date, time: v.time, untilDate: v.repeatUntil })
        : [fromLocalInputs(v.date, v.time)]
      const [first, ...rest] = dates
      if (!first) return 0
      const { data: parent, error } = await supabase
        .from('events')
        .insert({
          ...base,
          ...withTimes(first),
          recurrence_rule: v.repeat ? buildWeeklyRule([localParts(first).weekday]) : null,
          created_by: user.id,
        })
        .select('id, starts_at')
        .single()
      if (error) throw error
      const created = [parent]
      if (rest.length > 0) {
        const { data: children, error: err } = await supabase
          .from('events')
          .insert(
            rest.map((d) => ({
              ...base,
              ...withTimes(d),
              recurrence_parent_id: parent.id,
              created_by: user.id,
            })),
          )
          .select('id, starts_at')
        if (err) throw err
        created.push(...children)
      }
      if (isServiceKind(v) && v.hasRehearsal) {
        const { error: err } = await supabase
          .from('events')
          .insert(created.map((c) => rehearsalRow(c.id, new Date(c.starts_at))))
        if (err) throw err
      }
      return dates.length
    },
    onSuccess: async (count, v) => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
      await queryClient.invalidateQueries({ queryKey: ['planning'] })
      const withRehearsal = isServiceKind(v) && v.hasRehearsal ? ', cada um com ensaio' : ''
      toast.success(
        editing
          ? 'Evento atualizado'
          : count > 1
            ? `${count} ${isServiceKind(v) ? 'cultos' : 'eventos'} criados${withRehearsal}`
            : `${isServiceKind(v) ? 'Culto criado' : 'Evento criado'}${withRehearsal ? ' com ensaio' : ''}`,
      )
      onOpenChange(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const linkedToService = Boolean(event?.service_event_id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {event?.service_event_id
              ? 'Remarcar ensaio'
              : editing
                ? 'Editar evento'
                : 'Novo culto ou ensaio'}
          </DialogTitle>
          <DialogDescription>
            {event?.service_event_id
              ? 'Mude o dia e o horário do ensaio. A equipe escalada recebe um aviso.'
              : 'Horários no fuso de Brasília.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
          className="flex flex-col gap-4"
          noValidate
        >
          {!linkedToService && (
            <FormField id="event-kind" label="Tipo">
              <NativeSelect
                id="event-kind"
                {...form.register('kind', {
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                    const next = e.target.value as Values['kind']
                    const title = form.getValues('title')
                    if (Object.values(DEFAULT_TITLE).includes(title)) {
                      form.setValue('title', DEFAULT_TITLE[next])
                    }
                  },
                })}
              >
                <option value="service">Culto</option>
                <option value="rehearsal">Ensaio avulso</option>
                <option value="other">Outro</option>
              </NativeSelect>
            </FormField>
          )}
          <FormField id="event-title" label="Nome" error={errors.title?.message}>
            <Input id="event-title" {...form.register('title')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="event-date" label="Data" error={errors.date?.message}>
              <Input
                id="event-date"
                type="date"
                {...form.register('date', { onChange: (e) => onDateChange(e.target.value) })}
              />
            </FormField>
            <FormField
              id="event-time"
              label={isService ? 'Início do culto' : 'Horário'}
              error={errors.time?.message}
            >
              <Input
                id="event-time"
                type="time"
                {...form.register('time', { onChange: (e) => onTimeChange(e.target.value) })}
              />
            </FormField>
          </div>
          {kind !== 'other' && (
            <FormField
              id="event-arrival"
              label={isService ? 'Chegada da equipe' : 'Chegada para o ensaio'}
              hint="Atraso e abertura do registro de presença contam a partir deste horário."
              error={errors.arrival?.message}
            >
              <Input id="event-arrival" type="time" {...form.register('arrival')} />
            </FormField>
          )}
          {isService && (
            <FormField
              id="event-soundcheck"
              label="Passagem de som (opcional)"
              error={errors.soundcheck?.message}
            >
              <Input id="event-soundcheck" type="time" {...form.register('soundcheck')} />
            </FormField>
          )}
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
              placeholder="Ex.: Templo principal"
              {...form.register('location')}
            />
          </FormField>

          {isService && (
            <div className="border-info/60 flex flex-col gap-3 rounded-xl border p-3">
              <Label className="min-h-11 cursor-pointer font-normal">
                <Checkbox
                  checked={hasRehearsal}
                  onCheckedChange={(v) => form.setValue('hasRehearsal', v === true)}
                />
                <span className="text-info font-semibold">Ensaio deste culto</span>
              </Label>
              {hasRehearsal && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      id="rehearsal-date"
                      label={`Dia${rehearsalDate ? ` (${weekdayLabel(rehearsalDate)})` : ''}`}
                      error={errors.rehearsalDate?.message}
                    >
                      <Input
                        id="rehearsal-date"
                        type="date"
                        max={date || undefined}
                        {...form.register('rehearsalDate')}
                      />
                    </FormField>
                    <FormField id="rehearsal-time" label="Horário">
                      <Input
                        id="rehearsal-time"
                        type="time"
                        {...form.register('rehearsalTime', {
                          onChange: (e) => onRehearsalTimeChange(e.target.value),
                        })}
                      />
                    </FormField>
                  </div>
                  <FormField
                    id="rehearsal-arrival"
                    label="Chegada para o ensaio"
                    error={errors.rehearsalArrival?.message}
                  >
                    <Input
                      id="rehearsal-arrival"
                      type="time"
                      {...form.register('rehearsalArrival')}
                    />
                  </FormField>
                  <p className="text-muted-foreground text-[13px]">
                    A equipe escalada no culto vai para o ensaio automaticamente.
                    {repeat && ' Nas outras semanas o ensaio fica a mesma distância do culto.'}
                  </p>
                </>
              )}
            </div>
          )}

          {!editing && (
            <div className="flex flex-col gap-3 rounded-xl border p-3">
              <Label className="min-h-11 cursor-pointer font-normal">
                <Checkbox
                  checked={repeat}
                  onCheckedChange={(v) => {
                    form.setValue('repeat', v === true)
                    if (v === true && !form.getValues('repeatUntil') && date) {
                      form.setValue('repeatUntil', addDaysToKey(date, 7 * 26)) // ~6 meses
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

/** Minutos entre um horário anterior e o início (ex.: 23:50 → 00:10 = 20). */
function minutesBefore(startTime: string, earlier: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }
  return (toMin(startTime) - toMin(earlier) + 1440) % 1440
}

function isServiceKind(v: Values): boolean {
  return v.kind === 'service'
}
