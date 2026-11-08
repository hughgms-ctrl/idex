import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  groupHistory,
  stepLabel,
  type HistoryCard,
  type HistoryRow,
} from '@/features/attendance/justification-history'
import { attendanceKeys } from '@/features/attendance/queries'
import { useChurch } from '@/features/church/church-context'
import { formatDateTime, formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const PAGE = 20

const STATUS: Record<HistoryCard['status'], { label: string; cls: string }> = {
  approved: { label: 'Aprovado', cls: 'bg-primary text-primary-foreground' },
  rejected: { label: 'Recusado', cls: 'bg-destructive text-white' },
  pending: { label: 'Aguardando', cls: 'border border-info text-foreground' },
  cancelled: { label: 'Cancelado', cls: 'border text-muted-foreground' },
}

function useJustificationHistory(ministryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'justification-history', ministryId ?? ''],
    enabled: Boolean(ministryId) && enabled,
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from('justification_log')
        .select(
          'id, justification_id, action, kind, reason, note, at, ministry_member_id, events!inner(id, title, starts_at, arrive_at, service_event_id, ministry_id), ministry_members(profiles(full_name)), actor_profile:profiles!justification_log_actor_fkey(full_name)',
        )
        .eq('events.ministry_id', ministryId ?? '')
        .order('at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return data.map((r) => ({
        id: r.id,
        justification_id: r.justification_id,
        action: r.action,
        kind: r.kind,
        reason: r.reason,
        note: r.note,
        at: r.at,
        member_id: r.ministry_member_id ?? '',
        member: r.ministry_members?.profiles?.full_name ?? 'Integrante',
        actor: r.actor_profile?.full_name ?? null,
        event: {
          id: r.events.id,
          title: r.events.title,
          starts_at: r.events.starts_at,
          arrive_at: r.events.arrive_at,
          service_event_id: r.events.service_event_id,
        },
      }))
    },
  })
}

/** Histórico dos avisos de falta/atraso (só líder): um cartão por aviso. */
export function JustificationHistoryPage() {
  const { ministry, isLeader } = useChurch()
  const leader = ministry ? isLeader(ministry.id) : false
  const history = useJustificationHistory(ministry?.id, leader)
  const [person, setPerson] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const cards = useMemo(() => groupHistory(history.data ?? []), [history.data])
  const people = useMemo(
    () =>
      [...new Map(cards.map((c) => [c.memberId, c.member]))].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [cards],
  )
  const filtered = person ? cards.filter((c) => c.memberId === person) : cards
  const shown = filtered.slice(0, limit)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/presenca">
            <ArrowLeft aria-hidden="true" /> Presença
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Histórico de avisos"
        description="Avisos de falta e atraso: quem enviou, quem analisou e quando."
      />

      {!leader ? (
        <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
          Só o líder do ministério vê o histórico de avisos.
        </Panel>
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : history.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : cards.length === 0 ? (
        <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
          Nenhum aviso registrado ainda.
        </Panel>
      ) : (
        <>
          {people.length > 1 && (
            <NativeSelect
              aria-label="Filtrar por pessoa"
              value={person}
              onChange={(e) => {
                setPerson(e.target.value)
                setLimit(PAGE)
              }}
            >
              <option value="">Todas as pessoas</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          )}
          <p className="text-muted-foreground -mt-2 text-xs">
            {filtered.length} {filtered.length === 1 ? 'aviso' : 'avisos'}
          </p>
          <ul className="flex flex-col gap-3">
            {shown.map((c) => (
              <HistoryItem key={c.key} card={c} />
            ))}
          </ul>
          {filtered.length > shown.length && (
            <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
              Mostrar mais ({filtered.length - shown.length})
            </Button>
          )}
        </>
      )}
    </>
  )
}

function HistoryItem({ card }: { card: HistoryCard }) {
  const status = STATUS[card.status]
  return (
    <li className="bg-card flex flex-col gap-2 rounded-2xl border px-4 py-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-info text-xs font-semibold tracking-wider">
            AVISO DE {card.kind === 'late' ? 'ATRASO' : 'FALTA'}
            {card.byLeader ? ' · REGISTRADO PELO LÍDER' : ''}
          </span>
          <span className="truncate font-medium">{card.member}</span>
        </div>
        <span
          className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', status.cls)}
        >
          {status.label}
        </span>
      </div>
      <ul className="text-muted-foreground flex flex-col text-xs">
        {card.events.map((e) => (
          <li key={e.id}>
            {e.title} · {formatEventDate(e.starts_at)}
          </li>
        ))}
      </ul>
      {card.reason && <p className="text-sm">“{card.reason}”</p>}
      <ol className="flex flex-col gap-0.5 border-t pt-2">
        {card.steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span>{stepLabel(s, card.member)}</span>
            <span className="text-muted-foreground font-mono">{formatDateTime(s.at)}</span>
            {s.note && s.action !== 'approved' && (
              <span className="text-muted-foreground">· {s.note}</span>
            )}
          </li>
        ))}
      </ol>
    </li>
  )
}
