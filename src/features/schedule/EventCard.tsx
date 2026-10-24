import { Link } from 'react-router'
import { AlertCircle } from 'lucide-react'
import { assignmentConflicts, suggestSubstitutes } from '@domain/schedule.ts'
import { localParts } from '@domain/time.ts'

import { EVENT_KIND_LABEL } from '@/features/schedule/datetime'
import type { ScheduleEvent } from '@/features/schedule/queries'
import type { ScheduleData } from '@/features/schedule/useScheduleData'
import { cn } from '@/lib/utils'

const pad = (n: number) => String(n).padStart(2, '0')
const hour = (iso: string) => {
  const t = localParts(iso)
  return `${pad(t.hour)}h${t.minute ? pad(t.minute) : ''}`
}

export function EventCard({
  event,
  data,
  myMemberId,
  leader,
}: {
  event: ScheduleEvent
  data: ScheduleData
  myMemberId?: string
  leader: boolean
}) {
  const p = localParts(event.starts_at)
  const assignments = [...event.schedule_assignments].sort(
    (a, b) =>
      roleOrder(data, a.ministry_role_id) - roleOrder(data, b.ministry_role_id) ||
      (data.memberById.get(a.ministry_member_id)?.name ?? '').localeCompare(
        data.memberById.get(b.ministry_member_id)?.name ?? '',
      ),
  )

  // Alertas (só o líder vê): conflitos com sugestão de substituto
  const alerts = leader
    ? assignments.flatMap((a) => {
        const member = data.memberById.get(a.ministry_member_id)
        if (!member) return []
        const conflicts = assignmentConflicts({
          member,
          roleId: a.ministry_role_id,
          event,
          events: data.domainEvents,
          assignments: data.assignments,
          unavailability: data.unavailability,
          answers: data.answers,
          eligibility: data.eligibility,
        }).filter((c) => c.kind !== 'missing_role')
        const first = conflicts[0]
        if (!first) return []
        const [suggestion] = suggestSubstitutes({
          roleId: a.ministry_role_id,
          event,
          members: data.members,
          events: data.domainEvents,
          assignments: data.assignments,
          unavailability: data.unavailability,
          answers: data.answers,
          eligibility: data.eligibility,
          exclude: [member.id],
          limit: 1,
        })
        return [
          {
            id: a.id,
            text: `${first.message}${
              suggestion
                ? ` Sugestão: ${suggestion.member.name} (disponível, ${suggestion.assignmentsInMonth} ${suggestion.assignmentsInMonth === 1 ? 'escala' : 'escalas'} no mês).`
                : ' Nenhum substituto disponível.'
            }`,
          },
        ]
      })
    : []

  const content = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold">
            {pad(p.day)}/{pad(p.month)}
          </span>
          <span className="text-muted-foreground text-sm">
            {event.title} {pad(p.hour)}h{p.minute ? pad(p.minute) : ''}
            {event.arrive_at && ` · chegada ${hour(event.arrive_at)}`}
          </span>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold',
            event.kind === 'rehearsal'
              ? 'bg-info/15 text-info'
              : event.kind === 'service'
                ? 'bg-primary/15 text-primary'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {EVENT_KIND_LABEL[event.kind]?.toUpperCase()}
        </span>
      </div>
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-[13px]">
          {event.service_event_id
            ? 'A equipe escalada no culto entra aqui automaticamente.'
            : leader
              ? 'Ninguém escalado ainda. Toque para montar a escala.'
              : 'Escala ainda não montada.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5">
          {assignments.map((a) => {
            const mine = a.ministry_member_id === myMemberId
            return (
              <li
                key={a.id}
                className="bg-secondary flex justify-between gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px]"
              >
                <span className="text-muted-foreground truncate">
                  {(a.ministry_role_id && data.roleName.get(a.ministry_role_id)) || 'Equipe'}
                </span>
                <span
                  className={cn('truncate', mine ? 'text-primary font-semibold' : 'font-medium')}
                >
                  {mine
                    ? 'Você'
                    : (data.memberById.get(a.ministry_member_id)?.name.split(' ')[0] ?? '—')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="border-warning flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] leading-snug"
        >
          <AlertCircle className="text-warning mt-px size-[18px] shrink-0" aria-hidden="true" />
          <span>
            {alert.text} <span className="text-primary underline">Trocar</span>
          </span>
        </div>
      ))}
    </>
  )

  const className = cn(
    'flex flex-col gap-2.5 rounded-[18px] border border-l-4 bg-card p-3.5 text-left',
    event.kind === 'rehearsal'
      ? 'border-l-info'
      : event.kind === 'service'
        ? 'border-l-primary'
        : 'border-l-border',
  )
  return leader ? (
    <Link to={`/escalas/${event.id}`} className={cn(className, 'hover:border-input')}>
      {content}
    </Link>
  ) : (
    <section className={className}>{content}</section>
  )
}

function roleOrder(data: ScheduleData, roleId: string | null): number {
  if (!roleId) return 999
  const idx = data.roles.findIndex((r) => r.id === roleId)
  return idx < 0 ? 998 : idx
}
