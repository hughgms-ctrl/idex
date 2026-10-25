import { useState } from 'react'
import { Link } from 'react-router'
import { CalendarClock, MessageSquareWarning, QrCode } from 'lucide-react'

import { Panel } from '@/components/Section'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { JustifyDialog } from '@/features/attendance/MemberDialogs'
import { useMyCommitments, type MyCommitment } from '@/features/attendance/queries'
import { eventTimeRows } from '@/features/schedule/datetime'
import { formatEventDate, relativeDays } from '@/lib/format'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'
import { presenceState } from '@domain/schedule.ts'

const EVENT_KIND: Record<string, string> = {
  service: 'PRÓXIMO CULTO',
  rehearsal: 'PRÓXIMO ENSAIO',
  other: 'PRÓXIMO EVENTO',
}

const hhmm = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
})

type ShownEvent = {
  id: string
  title: string
  kind: string
  starts_at: string
  arrive_at: string | null
  soundcheck_at: string | null
  location_name: string | null
}

const label = (e: { kind: string; title: string }) => (e.kind === 'rehearsal' ? 'Ensaio' : e.title)

/**
 * Cartão do Início: o próximo compromisso e o que dá para fazer agora.
 * "Registrar presença" só aparece com o ponto aberto (2 h antes da chegada até
 * o fim); antes disso fica só "Avisar atraso ou falta". Quem não está escalado
 * vê o próximo evento do ministério, sem botões.
 */
export function PresenceCard({
  churchId,
  memberId,
  ministryEvent,
  ministryEventLoading,
  settings,
}: {
  churchId: string
  memberId: string | undefined
  ministryEvent: ShownEvent | null | undefined
  ministryEventLoading: boolean
  settings: Tables<'ministry_settings'> | null
}) {
  const now = useNow()
  const commitments = useMyCommitments(memberId)
  const [picking, setPicking] = useState(false)
  const [justifying, setJustifying] = useState<MyCommitment | null>(null)

  const list = commitments.data ?? []
  const state = presenceState(list, now)
  // avisar só antes do início e uma vez por evento
  const canWarn = list.filter((e) => Date.parse(e.starts_at) > now && !e.justification)
  const event: ShownEvent | null | undefined = state.kind === 'none' ? ministryEvent : state.event
  const loading = ministryEventLoading || (Boolean(memberId) && commitments.isPending)

  const warn = () => {
    if (canWarn.length === 1) setJustifying(canWarn[0] ?? null)
    else setPicking(true)
  }

  return (
    <>
      <Panel className="gap-4 rounded-[20px] p-[18px]">
        {loading ? (
          <Skeleton className="h-16" />
        ) : event ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span
                className={cn(
                  'text-xs font-semibold tracking-wider',
                  event.kind === 'rehearsal' ? 'text-info' : 'text-primary',
                )}
              >
                {state.kind === 'none'
                  ? (EVENT_KIND[event.kind] ?? 'PRÓXIMO EVENTO')
                  : event.kind === 'rehearsal'
                    ? 'SEU PRÓXIMO ENSAIO'
                    : 'SEU PRÓXIMO CULTO'}
              </span>
              <span className="font-display text-[22px] font-bold">
                {formatEventDate(event.starts_at)}
              </span>
              {event.arrive_at && (
                <span className="text-sm">
                  {eventTimeRows(event, settings)
                    .filter((r) => r.label !== 'Início' && r.label !== 'Início do ensaio')
                    .map((r) => `${r.label.replace(' (tolerância)', '')} ${r.time}`)
                    .join(' · ')}
                </span>
              )}
              <span className="text-muted-foreground text-sm">
                {[event.location_name, event.title].filter(Boolean).join(' · ')}
              </span>
            </div>
            <span className="bg-secondary shrink-0 rounded-[10px] px-2.5 py-1.5 font-mono text-[13px]">
              {relativeDays(event.starts_at)}
            </span>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-3 text-sm">
            <CalendarClock className="size-5" aria-hidden="true" />
            Nenhum culto ou ensaio marcado ainda.
          </div>
        )}

        {state.kind === 'open' && (
          <Button asChild size="lg" className="min-h-14 rounded-2xl text-[17px]">
            <Link to="/presenca/checkin">
              <QrCode className="size-[22px]" aria-hidden="true" />
              Registrar presença
            </Link>
          </Button>
        )}
        {state.kind === 'later_today' && (
          <p className="bg-secondary/50 rounded-xl px-3 py-2.5 text-sm">
            É hoje! O registro de presença abre às{' '}
            <strong className="font-mono">{hhmm.format(state.opensAt)}</strong>.
          </p>
        )}
        {state.kind !== 'none' && canWarn.length > 0 && (
          <Button
            variant={state.kind === 'open' ? 'ghost' : 'outline'}
            className={cn('min-h-11', state.kind === 'open' && 'text-muted-foreground')}
            onClick={warn}
          >
            <MessageSquareWarning aria-hidden="true" /> Avisar atraso ou falta
          </Button>
        )}
      </Panel>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avisar atraso ou falta</DialogTitle>
            <DialogDescription>
              Escolha o culto ou ensaio. O aviso vale só antes do início.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {canWarn.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(false)
                    setJustifying(e)
                  }}
                  className="hover:bg-secondary flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left"
                >
                  <span
                    className={cn(
                      'h-8 w-1 shrink-0 rounded-full',
                      e.kind === 'rehearsal' ? 'bg-info' : 'bg-primary',
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex flex-col">
                    <span className="text-[15px] font-medium">{label(e)}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatEventDate(e.starts_at)}
                      {e.arrive_at && ` · chegada ${hhmm.format(new Date(e.arrive_at))}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {memberId && (
        <JustifyDialog
          key={justifying?.id ?? 'none'}
          event={justifying ? { ...justifying, title: label(justifying) } : null}
          churchId={churchId}
          memberId={memberId}
          onClose={() => setJustifying(null)}
        />
      )}
    </>
  )
}
