import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck, CheckCircle2, Clock, QrCode, XCircle } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { JustifyDialog } from '@/features/attendance/MemberDialogs'
import { RehearsalAvailabilityField } from '@/features/availability/RehearsalAvailability'
import { useMyRehearsalAvailability } from '@/features/availability/queries'
import { useChurch } from '@/features/church/church-context'
import { useMinistrySettings } from '@/features/ministries/queries'
import { eventTimeRows } from '@/features/schedule/datetime'
import { scheduleKeys, useConfirmation, type ConfirmEvent } from '@/features/schedule/queries'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const JUSTIFICATION_STATUS: Record<string, string> = {
  pending: 'aguardando o líder',
  approved: 'aprovado',
  rejected: 'recusado',
}

// Para onde os avisos levam: confirmar presença no culto (vale para o ensaio)
// ou avisar o líder de atraso/falta.
export function ConfirmPage() {
  const { eventId } = useParams()
  const queryClient = useQueryClient()
  const { church, ministry, memberships } = useChurch()
  const memberIds = memberships.map((m) => m.id)
  const data = useConfirmation(eventId, memberIds)
  const [now] = useState(() => Date.now())
  const myMemberId = data.data?.assignments[0]?.ministry_member_id
  const rehearsalAnswers = useMyRehearsalAvailability(myMemberId)
  const settings = useMinistrySettings(ministry?.id)
  const [justify, setJustify] = useState<{
    event: ConfirmEvent
    kind: 'late' | 'absence'
  } | null>(null)

  const confirm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('confirm_my_presence', { p_event_id: eventId ?? '' })
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
      toast.success('Presença confirmada. Obrigado!')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (data.error) return <ErrorState error={data.error} />
  if (data.isPending && memberIds.length > 0) return <FullScreenLoader />
  const info = data.data
  if (!info) {
    return <PageHeader title="Confirmar presença" description="Culto não encontrado." />
  }

  const { service, rehearsal, assignments, justifications } = info
  const mine = (id: string) => assignments.filter((a) => a.event_id === id)
  const serviceAssignment = mine(service.id)[0]
  const past = new Date(service.starts_at).getTime() < now

  if (!serviceAssignment) {
    return (
      <>
        <PageHeader title="Confirmar presença" />
        <Panel>
          <p className="text-sm">
            Você não está na escala do <strong>{service.title}</strong> de{' '}
            {formatEventDate(service.starts_at)}.
          </p>
          <Button asChild variant="outline">
            <Link to="/escalas">Ver a escala</Link>
          </Button>
        </Panel>
      </>
    )
  }

  const benched = serviceAssignment.status === 'benched'
  const confirmed = serviceAssignment.status === 'confirmed'
  const absence = justifications.find(
    (j) => j.event_id === service.id && j.kind === 'absence' && j.status !== 'rejected',
  )

  return (
    <>
      <PageHeader
        title="Confirmar presença"
        description="O compromisso é com o culto: confirmando, você confirma o ensaio também."
      />

      {[service, ...(rehearsal ? [rehearsal] : [])]
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((event) => {
          const a = mine(event.id)[0]
          const notes = justifications.filter((j) => j.event_id === event.id)
          const isRehearsal = event.kind === 'rehearsal'
          const started = new Date(event.starts_at).getTime() < now
          return (
            <Panel key={event.id} className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span
                    className={cn(
                      'text-xs font-semibold tracking-wider',
                      isRehearsal ? 'text-info' : 'text-primary',
                    )}
                  >
                    {isRehearsal ? 'ENSAIO' : 'CULTO'}
                  </span>
                  <span className="font-display text-[20px] font-bold">
                    {formatEventDate(event.starts_at)}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {event.title}
                    {!isRehearsal && a?.ministry_roles?.name && ` · ${a.ministry_roles.name}`}
                  </span>
                </div>
                {a?.status === 'confirmed' && (
                  <CheckCircle2 className="text-primary size-6 shrink-0" aria-label="Confirmado" />
                )}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {eventTimeRows(event, settings.data).map((r) => (
                  <li key={r.label} className={r.strong ? 'font-semibold' : undefined}>
                    {r.label.replace(' (tolerância)', '')} {r.time}
                  </li>
                ))}
              </ul>
              {a?.status === 'benched' && (
                <p className="text-warning text-sm">
                  Você ficou de fora{a.benched_reason ? `: ${a.benched_reason}` : ''}.
                </p>
              )}
              {notes.map((j) => (
                <p key={j.id} className="text-muted-foreground text-sm">
                  Aviso de {j.kind === 'late' ? 'atraso' : 'falta'} enviado ·{' '}
                  {JUSTIFICATION_STATUS[j.status] ?? j.status}
                </p>
              ))}
              {a &&
                !started &&
                a.status !== 'benched' &&
                (isRehearsal || !rehearsal) &&
                serviceAssignment.status !== 'benched' &&
                !absence && (
                  <RehearsalAvailabilityField
                    key={rehearsalAnswers.data?.[service.id]?.note ?? ''}
                    serviceId={service.id}
                    answer={rehearsalAnswers.data?.[service.id]}
                    memberId={serviceAssignment.ministry_member_id}
                    churchId={church.id}
                  />
                )}
              {a && !started && a.status !== 'benched' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setJustify({ event, kind: 'late' })}
                  >
                    <Clock aria-hidden="true" /> Vou me atrasar
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setJustify({ event, kind: 'absence' })}
                  >
                    <XCircle aria-hidden="true" /> Não vou poder
                  </Button>
                </div>
              )}
            </Panel>
          )
        })}

      {!past && !benched && !absence && (
        <Button
          size="lg"
          className="min-h-14 rounded-2xl text-[17px]"
          disabled={confirmed || confirm.isPending}
          onClick={() => confirm.mutate()}
        >
          <CalendarCheck className="size-[22px]" aria-hidden="true" />
          {confirmed
            ? 'Presença confirmada'
            : confirm.isPending
              ? 'Confirmando…'
              : 'Confirmo minha presença'}
        </Button>
      )}
      <Button asChild variant="outline" className="min-h-12 rounded-2xl">
        <Link to="/presenca/checkin">
          <QrCode aria-hidden="true" /> Registrar presença
        </Link>
      </Button>

      <JustifyDialog
        key={justify ? `${justify.event.id}-${justify.kind}` : 'none'}
        event={justify?.event ?? null}
        churchId={church.id}
        memberId={serviceAssignment.ministry_member_id}
        initialKind={justify?.kind ?? 'late'}
        onClose={() => {
          setJustify(null)
          void data.refetch()
        }}
      />
    </>
  )
}
