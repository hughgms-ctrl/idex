import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Repeat } from 'lucide-react'
import { extendWeeklySeries, type SeriesOccurrence } from '@domain/schedule.ts'
import { addDaysToKey, localDateKey } from '@domain/time.ts'

import { useUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { scheduleKeys } from '@/features/schedule/queries'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

const COLS =
  'id, kind, title, location_name, starts_at, ends_at, arrive_at, soundcheck_at, recurrence_rule, recurrence_parent_id'

type Row = {
  id: string
  kind: Tables<'events'>['kind']
  title: string
  location_name: string | null
  starts_at: string
  ends_at: string | null
  arrive_at: string | null
  soundcheck_at: string | null
  recurrence_rule: string | null
  recurrence_parent_id: string | null
}

/** Séries semanais e o último evento de cada uma (com o ensaio dele). */
function useWeeklySeries(ministryId: string) {
  return useQuery({
    queryKey: [...scheduleKeys.all, 'weekly-series', ministryId],
    queryFn: async () => {
      const { data: parents, error } = await supabase
        .from('events')
        .select(COLS)
        .eq('ministry_id', ministryId)
        .not('recurrence_rule', 'is', null)
      if (error) throw error
      if (parents.length === 0) return []
      const { data: children, error: err } = await supabase
        .from('events')
        .select(COLS)
        .in(
          'recurrence_parent_id',
          parents.map((p) => p.id),
        )
      if (err) throw err
      const series = (parents as Row[]).map((parent) => {
        const all = [
          parent,
          ...(children as Row[]).filter((c) => c.recurrence_parent_id === parent.id),
        ]
        const last = all.reduce((a, b) => (b.starts_at > a.starts_at ? b : a))
        return { parent, last }
      })
      const lastIds = series.map((s) => s.last.id)
      const { data: rehearsals, error: rErr } = await supabase
        .from('events')
        .select('service_event_id, starts_at, ends_at, arrive_at')
        .in('service_event_id', lastIds)
      if (rErr) throw rErr
      return series.map((s) => ({
        ...s,
        lastRehearsal: rehearsals.find((r) => r.service_event_id === s.last.id) ?? null,
      }))
    },
  })
}

// "Não continuar" esconde o aviso daquela série até ela ganhar datas novas
const DISMISS_KEY = 'idex.series-dismissed'
const dismissKey = (s: Pending) => `${s.parent.id}:${s.last.starts_at}`

// Aviso no Planejamento: a repetição semanal parou antes do fim do trimestre
// → continua com os mesmos horários (e o ensaio, se o último culto tinha).
export function ContinueSeries({
  ministry,
  untilKey,
}: {
  ministry: Tables<'ministries'>
  untilKey: string // último dia do trimestre mostrado
}) {
  const user = useUser()
  const queryClient = useQueryClient()
  const series = useWeeklySeries(ministry.id)
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [recent] = useState(() => Date.now() - 30 * 86_400_000)
  const pending = (series.data ?? [])
    .filter((s) => new Date(s.last.starts_at).getTime() > recent)
    .map((s) => ({
      ...s,
      next: extendWeeklySeries({ last: s.last, lastRehearsal: s.lastRehearsal, untilKey }),
    }))
    .filter((s) => s.next.length > 0)

  const extend = useMutation({
    mutationFn: async (item: Pending & { next: SeriesOccurrence[] }) => {
      const { parent, last, next } = item
      const { data: created, error } = await supabase
        .from('events')
        .insert(
          next.map((n) => ({
            church_id: ministry.church_id,
            ministry_id: ministry.id,
            kind: last.kind,
            title: last.title,
            location_name: last.location_name,
            starts_at: n.starts_at,
            ends_at: n.ends_at,
            arrive_at: n.arrive_at,
            soundcheck_at: n.soundcheck_at,
            recurrence_parent_id: parent.id,
            created_by: user.id,
          })),
        )
        .select('id, starts_at')
      if (error) throw error
      const withRehearsal = next.filter((n) => n.rehearsal)
      if (withRehearsal.length > 0) {
        const idByStart = new Map(created.map((c) => [new Date(c.starts_at).getTime(), c.id]))
        const { error: err } = await supabase.from('events').insert(
          withRehearsal.map((n) => ({
            church_id: ministry.church_id,
            ministry_id: ministry.id,
            kind: 'rehearsal' as const,
            title: `Ensaio · ${last.title}`,
            location_name: last.location_name,
            starts_at: n.rehearsal!.starts_at,
            ends_at: n.rehearsal!.ends_at,
            arrive_at: n.rehearsal!.arrive_at,
            service_event_id: idByStart.get(new Date(n.starts_at).getTime()) ?? null,
            created_by: user.id,
          })),
        )
        if (err) throw err
      }
      return next.length
    },
    onSuccess: async (n) => {
      await queryClient.invalidateQueries()
      toast.success(`${n} ${n === 1 ? 'culto criado' : 'cultos criados'}`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const visible = pending.filter((s) => !dismissed.includes(dismissKey(s)))
  if (visible.length === 0) return null
  return (
    <section className="border-primary/50 bg-primary/5 flex flex-col gap-3 rounded-2xl border p-3.5">
      {visible.map((s) => (
        <SeriesRow
          key={s.parent.id}
          item={s}
          untilKey={untilKey}
          busy={extend.isPending}
          onCreate={(next) => extend.mutate({ ...s, next })}
          onDismiss={() => {
            const list = [...dismissed, dismissKey(s)]
            setDismissed(list)
            try {
              localStorage.setItem(DISMISS_KEY, JSON.stringify(list))
            } catch {
              // sem armazenamento: só esconde nesta visita
            }
          }}
        />
      ))}
    </section>
  )
}

type Pending = {
  parent: Row
  last: Row
  lastRehearsal: { starts_at: string; ends_at: string | null; arrive_at: string | null } | null
}

/** Uma série: escolher até quando continuar (padrão: fim do trimestre). */
function SeriesRow({
  item,
  untilKey,
  busy,
  onCreate,
  onDismiss,
}: {
  item: Pending
  untilKey: string
  busy: boolean
  onCreate: (next: SeriesOccurrence[]) => void
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)
  const [until, setUntil] = useState(untilKey)
  const lastKey = localDateKey(item.last.starts_at)
  const minKey = addDaysToKey(lastKey, 7)
  const next = /^\d{4}-\d{2}-\d{2}$/.test(until)
    ? extendWeeklySeries({ last: item.last, lastRehearsal: item.lastRehearsal, untilKey: until })
    : []
  const lastNew = next.at(-1)
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm">
        <Repeat className="text-primary mr-1.5 inline size-4" aria-hidden="true" />
        <strong>{item.parent.title}</strong> (toda semana) vai só até{' '}
        <strong>{formatDate(lastKey)}</strong>.
      </p>
      {open ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ate-${item.parent.id}`}>Continuar até</Label>
            <Input
              id={`ate-${item.parent.id}`}
              type="date"
              min={minKey}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="sm:max-w-56"
            />
          </div>
          <p className="text-muted-foreground text-[13px]">
            {next.length === 0
              ? `Escolha uma data a partir de ${formatDate(minKey)}.`
              : `Vai criar ${next.length} ${next.length === 1 ? 'data' : 'datas'}: de ${formatDate(localDateKey(next[0]!.starts_at))} a ${formatDate(localDateKey(lastNew!.starts_at))}${item.lastRehearsal ? ', cada uma com ensaio' : ''}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={busy || next.length === 0}
              onClick={() => onCreate(next)}
            >
              {busy ? 'Criando…' : `Criar ${next.length} ${next.length === 1 ? 'data' : 'datas'}`}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" onClick={() => setOpen(true)}>
            Continuar repetição…
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={onDismiss}>
            Não continuar
          </Button>
        </div>
      )}
    </div>
  )
}
