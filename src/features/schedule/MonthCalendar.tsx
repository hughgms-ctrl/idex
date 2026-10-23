import { localDateKey, localParts, zonedToUtc } from '@domain/time.ts'

import { WEEKDAY_SHORT } from '@/features/schedule/datetime'
import type { ScheduleEvent } from '@/features/schedule/queries'
import { cn } from '@/lib/utils'

// Calendário compacto do mês (visão do líder): pontos nos dias com evento.
export function MonthCalendar({
  year,
  month,
  events,
  onSelectDay,
}: {
  year: number
  month: number
  events: ScheduleEvent[]
  onSelectDay: (dateKey: string, hasEvents: boolean) => void
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
          const unfilled = dayEvents.some((e) => e.schedule_assignments.length === 0)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(key, dayEvents.length > 0)}
              aria-label={`Dia ${Number(key.slice(8))}${dayEvents.length ? `, ${dayEvents.length} evento(s)` : ''}`}
              className={cn(
                'hover:bg-secondary flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg font-mono text-[13px]',
                key === today && 'ring-primary ring-1',
              )}
            >
              {Number(key.slice(8))}
              <span className="flex h-1.5 gap-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={cn(
                      'size-1.5 rounded-full',
                      unfilled ? 'bg-warning' : e.kind === 'rehearsal' ? 'bg-info' : 'bg-primary',
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
