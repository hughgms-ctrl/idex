import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { QrCode } from 'lucide-react'

import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { ForgotDialog, JustifyDialog } from '@/features/attendance/MemberDialogs'
import { LEDGER_REASON, useMyAttendanceEvents, useMyLedger } from '@/features/attendance/queries'
import { formatDate, formatDayMonth, formatEventDate } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'

const REQUEST_LABEL: Record<string, string> = {
  pending: 'em análise',
  approved: 'aprovado',
  adjusted: 'aprovado com ajuste',
  rejected: 'recusado',
}
const JUST_LABEL: Record<string, string> = {
  pending: 'em análise',
  approved: 'aprovada',
  rejected: 'recusada',
}

export function MemberAttendance({
  churchId,
  memberId,
  cycle,
  settings,
}: {
  churchId: string
  memberId: string
  cycle: Tables<'cycles'> | null
  settings: Tables<'ministry_settings'> | null
}) {
  const [params, setParams] = useSearchParams()
  const ledger = useMyLedger(memberId, cycle?.id)
  const events = useMyAttendanceEvents(memberId)
  const [forgot, setForgot] = useState<{ id: string; title: string; starts_at: string } | null>(
    null,
  )
  const [justify, setJustify] = useState<{ id: string; title: string; starts_at: string } | null>(
    null,
  )

  const now = useNow()
  const deadlineMs = (settings?.checkin_request_deadline_hours ?? 48) * 3_600_000
  const list = events.data ?? []
  const forgotten = list.filter((e) => {
    const start = Date.parse(e.event.starts_at)
    const end = e.event.ends_at ? Date.parse(e.event.ends_at) : start + 2 * 3_600_000
    return (
      start <= now &&
      now <= end + deadlineMs &&
      !e.checkin &&
      !e.request &&
      e.justification?.status !== 'approved'
    )
  })
  const upcoming = list.filter((e) => Date.parse(e.event.starts_at) > now)
  const history = list.filter((e) => e.request || e.justification)

  // atalho vindo do Início: /presenca?justificar=<eventId>
  const justifyId = params.get('justificar')
  const fromParam = justifyId
    ? events.data?.find((e) => e.event.id === justifyId && !e.justification)?.event
    : undefined
  const justifyEvent = justify ?? fromParam ?? null
  const closeJustify = () => {
    setJustify(null)
    if (justifyId) setParams({}, { replace: true })
  }

  const total = (ledger.data ?? []).reduce((sum, e) => sum + e.delta, 0)
  const start = settings?.cycle_starting_points ?? 100
  const min = settings?.cycle_min_points ?? 70

  return (
    <>
      <Button asChild size="lg" className="min-h-14 rounded-2xl text-[17px]">
        <Link to="/presenca/checkin">
          <QrCode className="size-[22px]" aria-hidden="true" /> Bater ponto
        </Link>
      </Button>

      <Panel>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Meus pontos no ciclo</h2>
          <span className="font-mono text-[15px]">
            <span className={total >= min ? 'text-primary' : 'text-warning'}>
              {ledger.data ? total : '—'}
            </span>{' '}
            / {start}
          </span>
        </div>
        <div className="bg-border h-2 overflow-hidden rounded">
          <div
            className={cn('h-2', total >= min ? 'bg-primary' : 'bg-warning')}
            style={{ width: `${Math.max(0, Math.min(100, (total / start) * 100))}%` }}
          />
        </div>
        <p className="text-muted-foreground text-[13px]">
          {cycle ? `Ciclo de ${formatDate(cycle.starts_on)} a ${formatDate(cycle.ends_on)}. ` : ''}
          Mínimo de {min} pontos para continuar na escala do próximo ciclo.
        </p>
        {ledger.data && ledger.data.length > 0 && (
          <ul className="divide-border flex flex-col divide-y border-t">
            {ledger.data.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>{LEDGER_REASON[entry.reason] ?? entry.reason}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {entry.events
                      ? `${entry.events.title} · ${formatDayMonth(entry.events.starts_at)}`
                      : formatDate(entry.created_at)}
                    {entry.note && entry.reason !== 'cycle_start' ? ` · ${entry.note}` : ''}
                  </span>
                </span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    entry.delta < 0 ? 'text-warning' : 'text-primary',
                  )}
                >
                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {forgotten.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle title="Esqueceu de registrar?" />
          <ul className="flex flex-col gap-2">
            {forgotten.map((e) => (
              <li key={e.event.id}>
                <Panel className="flex-row items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col text-sm">
                    <span className="font-medium">{e.event.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatEventDate(e.event.starts_at)}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setForgot(e.event)}>
                    Pedir registro
                  </Button>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle title="Próximos compromissos" />
          <ul className="flex flex-col gap-2">
            {upcoming.map((e) => (
              <li key={e.event.id}>
                <Panel className="flex-row items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col text-sm">
                    <span className="font-medium">{e.event.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatEventDate(e.event.starts_at)}
                    </span>
                  </span>
                  {e.justification ? (
                    <span className="text-muted-foreground text-xs">
                      Aviso {JUST_LABEL[e.justification.status]}
                    </span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setJustify(e.event)}>
                      Vou faltar/atrasar
                    </Button>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle title="Meus pedidos e avisos" />
          <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
            {history.map((e) => (
              <li
                key={e.event.id}
                className="flex flex-col gap-0.5 border-b px-3.5 py-2.5 text-sm last:border-b-0"
              >
                <span className="font-medium">
                  {e.event.title} · {formatDayMonth(e.event.starts_at)}
                </span>
                {e.request && (
                  <span className="text-muted-foreground text-xs">
                    Esqueci de registrar: {REQUEST_LABEL[e.request.status]}
                  </span>
                )}
                {e.justification && (
                  <span className="text-muted-foreground text-xs">
                    Aviso de {e.justification.kind === 'late' ? 'atraso' : 'falta'}:{' '}
                    {JUST_LABEL[e.justification.status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ForgotDialog key={forgot?.id ?? 'none'} event={forgot} onClose={() => setForgot(null)} />
      <JustifyDialog
        key={justifyEvent?.id ?? 'none-j'}
        event={justifyEvent}
        churchId={churchId}
        memberId={memberId}
        onClose={closeJustify}
      />
    </>
  )
}
