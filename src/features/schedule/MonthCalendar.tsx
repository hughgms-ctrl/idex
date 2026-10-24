import { localDateKey, localParts, zonedToUtc } from '@domain/time.ts'

import { WEEKDAY_SHORT } from '@/features/schedule/datetime'
import type { ScheduleEvent } from '@/features/schedule/queries'
import { cn } from '@/lib/utils'

const KIND_DOT: Record<string, string> = {
  service: 'bg-primary',
  rehearsal: 'bg-info',
  other: 'bg-muted-foreground',
}

// Calendário compacto do mês: um ponto por evento (culto verde, ensaio azul).
export function MonthCalendar({
  year,
  month,
  events,
  onSelectDay,
  leader = false,
}: {
  year: number
  month: number
  events: ScheduleEvent[]
  onSelectDay: (dateKey: string, hasEvents: boolean) => void
  leader?: boolean
}) {
  const first = zonedToUtc(year, month, 1, 12)
  const startWeekday = localParts(first).weekday
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const today = localDateKey(new Date())
  const byDay = new Map<string, ScheduleEvent[]>()
  for (const e of events) {
    const key = localDateKey(e.starts_at)
    byDay.set(key, [...(byDay.get(key) ?? []), e])
  }

  const cells: (string | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    ),
  ]

  return (
    <div className="bg-card rounded-2xl border p-3">
      <div className="text-muted-foreground grid grid-cols-7 gap-1 text-center text-[11px]">
        {WEEKDAY_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((key, i) => {
          if (!key) return <span key={`empty-${i}`} />
          const dayEvents = byDay.get(key) ?? []
          // ensaio ligado a culto recebe a equipe do culto: não conta como pendente
          const unfilled = dayEvents.some(
            (e) => e.schedule_assignments.length === 0 && !e.service_event_id,
          )
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key, dayEvents.length > 0)}
              aria-label={`Dia ${Number(key.slice(8))}${dayEvents.length ? `, ${dayEvents.length} evento(s)` : ''}`}
              className={cn(
                'hover:bg-secondary flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg font-mono text-[13px]',
                key === today && 'ring-primary ring-1',
                leader && unfilled && 'text-warning font-semibold',
              )}
            >
              {Number(key.slice(8))}
              <span className="flex h-1.5 gap-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={cn(
                      'size-1.5 rounded-full',
                      KIND_DOT[e.kind] ?? 'bg-muted-foreground',
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <div className="text-muted-foreground mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary size-2 rounded-full" /> Culto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-info size-2 rounded-full" /> Ensaio
        </span>
        {leader && (
          <span>
            <span className="text-warning font-mono font-semibold">12</span> = falta montar a escala
          </span>
        )}
      </div>
    </div>
  )
}
