import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Repeat } from 'lucide-react'
import { extendWeeklySeries } from '@domain/schedule.ts'
import { localDateKey } from '@domain/time.ts'

import { useUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
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
  const [recent] = useState(() => Date.now() - 30 * 86_400_000)
  const pending = (series.data ?? [])
    .filter((s) => new Date(s.last.starts_at).getTime() > recent)
    .map((s) => ({
      ...s,
      next: extendWeeklySeries({ last: s.last, lastRehearsal: s.lastRehearsal, untilKey }),
    }))
    .filter((s) => s.next.length > 0)

  const extend = useMutation({
    mutationFn: async (item: (typeof pending)[number]) => {
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

  if (pending.length === 0) return null
  return (
    <section className="border-primary/50 bg-primary/5 flex flex-col gap-3 rounded-2xl border p-3.5">
      {pending.map((s) => (
        <div key={s.parent.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <Repeat className="text-primary mr-1.5 inline size-4" aria-hidden="true" />
            <strong>{s.parent.title}</strong> (toda semana) vai só até{' '}
            <strong>{formatDate(localDateKey(s.last.starts_at))}</strong>. Faltam {s.next.length}{' '}
            {s.next.length === 1 ? 'data' : 'datas'} até {formatDate(untilKey)}
            {s.lastRehearsal ? ', com ensaio' : ''}.
          </p>
          <Button
            className="min-h-11 shrink-0"
            disabled={extend.isPending}
            onClick={() => extend.mutate(s)}
          >
            {extend.isPending ? 'Criando…' : 'Continuar repetição'}
          </Button>
        </div>
      ))}
    </section>
  )
}
