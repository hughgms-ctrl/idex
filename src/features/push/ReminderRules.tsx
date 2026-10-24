import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { describeRule, type ReminderTiming } from '@domain/reminders.ts'

import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

type Rule = Tables<'reminder_rules'> & { timing: ReminderTiming }
type Kind = 'service' | 'rehearsal'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MINUTES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 720]
const minutesLabel = (n: number) =>
  n < 60 ? `${n} min` : n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n / 60} h`

const keyFor = (ministryId: string) => ['reminder-rules', ministryId]

// Avisos programados de culto e ensaio (celular e WhatsApp). Cada aviso leva
// a pessoa para /confirmar/<culto>: confirmar presença ou avisar atraso/falta.
export function ReminderRules({
  ministryId,
  churchId,
  canEdit,
}: {
  ministryId: string
  churchId: string
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const rules = useQuery({
    queryKey: keyFor(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_rules')
        .select('*')
        .eq('ministry_id', ministryId)
        .order('created_at')
      if (error) throw error
      return data as Rule[]
    },
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: keyFor(ministryId) })

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Rule> }) => {
      const { error } = await supabase.from('reminder_rules').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminder_rules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Avisos de culto e ensaio" />
      <p className="text-muted-foreground text-[13px]">
        Cada aviso leva a pessoa a confirmar presença ou avisar atraso/falta. Vai no celular (app
        instalado com avisos ligados) e no WhatsApp. Quem ficou de fora ou avisou falta não recebe.
      </p>
      {(['rehearsal', 'service'] as Kind[]).map((kind) => {
        const list = (rules.data ?? []).filter((r) => r.event_kind === kind)
        return (
          <Panel
            key={kind}
            className={
              kind === 'service'
                ? 'border-l-primary gap-3 border-l-4'
                : 'border-l-info gap-3 border-l-4'
            }
          >
            <h3 className="text-[15px] font-semibold">{kind === 'service' ? 'Culto' : 'Ensaio'}</h3>
            {list.length === 0 && (
              <p className="text-muted-foreground text-sm">Nenhum aviso programado.</p>
            )}
            <ul className="flex flex-col gap-2">
              {list.map((r) => (
                <li key={r.id} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={`rule-${r.id}`}
                    checked={r.enabled}
                    disabled={!canEdit || update.isPending}
                    onCheckedChange={(v) =>
                      update.mutate({ id: r.id, patch: { enabled: v === true } })
                    }
                  />
                  <Label
                    htmlFor={`rule-${r.id}`}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0"
                  >
                    <span className={r.enabled ? undefined : 'text-muted-foreground line-through'}>
                      {describeRule(r)}
                    </span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {r.push_only ? 'só no celular' : 'celular e WhatsApp'}
                    </span>
                  </Label>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Apagar aviso: ${describeRule(r)}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <NewRule kind={kind} ministryId={ministryId} churchId={churchId} onSaved={refresh} />
            )}
          </Panel>
        )
      })}
    </section>
  )
}

function NewRule({
  kind,
  ministryId,
  churchId,
  onSaved,
}: {
  kind: Kind
  ministryId: string
  churchId: string
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [timing, setTiming] = useState<ReminderTiming>('weekday')
  const [weekday, setWeekday] = useState(1)
  const [daysBefore, setDaysBefore] = useState(0)
  const [time, setTime] = useState('09:00')
  const [minutes, setMinutes] = useState(60)
  const [pushOnly, setPushOnly] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('reminder_rules').insert({
        church_id: churchId,
        ministry_id: ministryId,
        event_kind: kind,
        timing,
        weekday: timing === 'weekday' ? weekday : null,
        days_before: timing === 'days_before' ? daysBefore : null,
        at_time: timing === 'minutes_before' ? null : time,
        minutes_before: timing === 'minutes_before' ? minutes : null,
        push_only: pushOnly,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Aviso adicionado')
      setOpen(false)
      onSaved()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" /> Adicionar aviso
      </Button>
    )
  }

  const id = `nova-regra-${kind}`
  return (
    <div className="bg-secondary/40 flex flex-col gap-3 rounded-xl p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-quando`}>Quando</Label>
        <NativeSelect
          id={`${id}-quando`}
          value={timing}
          onChange={(e) => setTiming(e.target.value as ReminderTiming)}
        >
          <option value="weekday">Num dia da semana</option>
          <option value="days_before">Dias antes (ou no dia)</option>
          <option value="minutes_before">Perto do horário de chegada</option>
        </NativeSelect>
      </div>
      {timing === 'minutes_before' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-min`}>Quanto tempo antes da chegada</Label>
          <NativeSelect
            id={`${id}-min`}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {minutesLabel(m)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-dia`}>{timing === 'weekday' ? 'Dia' : 'Quando'}</Label>
            {timing === 'weekday' ? (
              <NativeSelect
                id={`${id}-dia`}
                value={weekday}
                onChange={(e) => setWeekday(Number(e.target.value))}
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <NativeSelect
                id={`${id}-dia`}
                value={daysBefore}
                onChange={(e) => setDaysBefore(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'No dia' : `${n} dia${n > 1 ? 's' : ''} antes`}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-hora`}>Hora</Label>
            <Input
              id={`${id}-hora`}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-canal`}>Por onde</Label>
        <NativeSelect
          id={`${id}-canal`}
          value={pushOnly ? 'push' : 'all'}
          onChange={(e) => setPushOnly(e.target.value === 'push')}
        >
          <option value="all">Celular e WhatsApp</option>
          <option value="push">Só no celular</option>
        </NativeSelect>
      </div>
      <p className="text-muted-foreground text-xs">
        {describeRule({
          timing,
          weekday,
          days_before: daysBefore,
          at_time: time,
          minutes_before: minutes,
        })}
        {timing === 'weekday' && ' (na semana do evento, até o próprio dia)'}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={save.isPending || (timing !== 'minutes_before' && !time)}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Salvando…' : 'Salvar aviso'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
