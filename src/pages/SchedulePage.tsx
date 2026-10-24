import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseWeeklyRule } from '@domain/schedule.ts'
import { addDaysToKey, addMonths, localDateKey, localParts } from '@domain/time.ts'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { MONTH_NAMES, WEEKDAY_SHORT } from '@/features/schedule/datetime'
import { EventCard } from '@/features/schedule/EventCard'
import { EventDialog } from '@/features/schedule/EventDialog'
import { MonthCalendar } from '@/features/schedule/MonthCalendar'
import { scheduleKeys } from '@/features/schedule/queries'
import { UnavailabilityDialog } from '@/features/schedule/UnavailabilityDialog'
import { useScheduleData } from '@/features/schedule/useScheduleData'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function SchedulePage() {
  const { church, ministry, memberships, isLeader } = useChurch()
  const now = localParts(new Date())
  const [base, setBase] = useState({ year: now.year, month: now.month })
  const [selected, setSelected] = useState({ year: now.year, month: now.month })
  const [onlyMine, setOnlyMine] = useState(false)
  const [unavOpen, setUnavOpen] = useState(false)
  const [eventDialog, setEventDialog] = useState<{ date?: string } | null>(null)
  const leader = ministry ? isLeader(ministry.id) : false
  const myMember = memberships.find((m) => m.ministry_id === ministry?.id)
  const data = useScheduleData(ministry?.id, selected.year, selected.month)

  if (!ministry) return <PageHeader title="Escala" description="Nenhum ministério cadastrado." />

  const months = [0, 1, 2].map((d) => addMonths(base.year, base.month, d))
  const events = onlyMine
    ? data.events.filter((e) =>
        e.schedule_assignments.some((a) => a.ministry_member_id === myMember?.id),
      )
    : data.events

  return (
    <>
      <PageHeader
        title="Escala"
        action={
          <div className="flex gap-2">
            {myMember && (
              <Button variant="outline" onClick={() => setUnavOpen(true)}>
                Marcar indisponível
              </Button>
            )}
            {leader && (
              <Button onClick={() => setEventDialog({})} aria-label="Novo culto ou ensaio">
                <Plus aria-hidden="true" />
                <span className="hidden sm:inline">Novo evento</span>
              </Button>
            )}
          </div>
        }
      />

      <div className="-mx-2 flex items-center gap-0.5" role="tablist" aria-label="Mês">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Meses anteriores"
          onClick={() => setBase((b) => addMonths(b.year, b.month, -1))}
        >
          <ChevronLeft />
        </Button>
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {months.map((m) => {
            const active = m.year === selected.year && m.month === selected.month
            return (
              <button
                key={`${m.year}-${m.month}`}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(m)}
                className={cn(
                  'min-h-10 shrink-0 rounded-full px-3.5 text-sm',
                  active
                    ? 'bg-foreground text-background font-semibold'
                    : 'text-muted-foreground hover:text-foreground border',
                )}
              >
                {MONTH_NAMES[m.month - 1]}
                {m.year !== now.year && ` ${m.year}`}
              </button>
            )
          })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximos meses"
          onClick={() => setBase((b) => addMonths(b.year, b.month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      <MonthCalendar
        leader={leader}
        year={selected.year}
        month={selected.month}
        events={data.events}
        onSelectDay={(key, hasEvents) => {
          if (hasEvents) {
            document
              .getElementById(`dia-${key}`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else if (leader) {
            setEventDialog({ date: key })
          }
        }}
      />

      {myMember && (
        <div className="flex gap-2">
          {[
            { value: false, label: 'Todas' },
            { value: true, label: 'Só as minhas' },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              aria-pressed={onlyMine === opt.value}
              onClick={() => setOnlyMine(opt.value)}
              className={cn(
                'min-h-10 rounded-full px-4 text-sm',
                onlyMine === opt.value ? 'bg-secondary font-semibold' : 'text-muted-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {data.error ? (
        <ErrorState error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : events.length === 0 ? (
        <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
          {onlyMine
            ? 'Você não está escalado neste mês.'
            : leader
              ? 'Nenhum culto ou ensaio neste mês. Toque em um dia do calendário para criar.'
              : 'Nenhum culto ou ensaio marcado neste mês.'}
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {events.map((event) => (
            <div key={event.id} id={`dia-${localDateKey(event.starts_at)}`} className="scroll-mt-4">
              <EventCard event={event} data={data} myMemberId={myMember?.id} leader={leader} />
            </div>
          ))}
        </div>
      )}

      <MyUnavailability
        ministryId={ministry.id}
        memberId={myMember?.id}
        rows={data.unavailabilityRows}
      />

      {myMember && (
        <UnavailabilityDialog
          open={unavOpen}
          onOpenChange={setUnavOpen}
          churchId={church.id}
          ministryId={ministry.id}
          memberId={myMember.id}
        />
      )}
      {leader && (
        <EventDialog
          open={Boolean(eventDialog)}
          onOpenChange={(open) => !open && setEventDialog(null)}
          ministry={ministry}
          defaultDate={eventDialog?.date}
        />
      )}
    </>
  )
}

function MyUnavailability({
  ministryId,
  memberId,
  rows,
}: {
  ministryId: string
  memberId?: string
  rows: {
    id: string
    ministry_member_id: string
    starts_at: string
    ends_at: string
    recurrence_rule: string | null
    reason: string | null
  }[]
}) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('member_unavailability').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.unavailability(ministryId) })
      toast.success('Indisponibilidade removida')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  const mine = rows.filter(
    (r) => r.ministry_member_id === memberId && new Date(r.ends_at) > new Date(),
  )
  if (mine.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Minhas indisponibilidades" />
      <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
        {mine.map((r) => {
          const weekdays = parseWeeklyRule(r.recurrence_rule)
          const lastDay = addDaysToKey(localDateKey(r.ends_at), -1)
          return (
            <li
              key={r.id}
              className="flex min-h-14 items-center gap-3 border-b px-3.5 py-2 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span>
                  {weekdays
                    ? `Toda ${weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ')} até ${formatDate(lastDay)}`
                    : localDateKey(r.starts_at) === lastDay
                      ? formatDate(lastDay)
                      : `${formatDate(localDateKey(r.starts_at))} a ${formatDate(lastDay)}`}
                </span>
                {r.reason && (
                  <span className="text-muted-foreground truncate text-xs">{r.reason}</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover indisponibilidade"
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
