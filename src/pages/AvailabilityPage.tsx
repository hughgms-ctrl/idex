import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  useMyAvailability,
  useMyRehearsalAvailability,
  useSetAvailability,
  useUpcomingEvents,
  type UpcomingEvent,
} from '@/features/availability/queries'
import { AvailabilityFilter } from '@/features/availability/AvailabilityFilter'
import {
  answerKind,
  matchesAvailabilityFilter,
  type AvailabilityFilterValue,
} from '@/features/availability/availability-filter'
import { RehearsalAvailabilityField } from '@/features/availability/RehearsalAvailability'
import { useChurch } from '@/features/church/church-context'
import { useMinistrySettings } from '@/features/ministries/queries'
import { EVENT_KIND_LABEL } from '@/features/schedule/datetime'
import { errorMessage } from '@/lib/errors'
import { APP_TIMEZONE, formatDate, formatEventDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const monthFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: APP_TIMEZONE,
  month: 'long',
  year: 'numeric',
})

// O integrante diz em quais cultos/ensaios do período aberto pelo líder
// (Configurações) pode servir. Quem não responde pode ser escalado normalmente.
export function AvailabilityPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const onboarding = params.get('inicio') === '1'
  const { church, ministry, memberships, isLeader } = useChurch()
  const leader = ministry ? isLeader(ministry.id) : false
  const membership = memberships.find((m) => m.ministry_id === ministry?.id)
  const settings = useMinistrySettings(ministry?.id)
  const period =
    settings.data?.availability_starts_on && settings.data.availability_ends_on
      ? {
          startsOn: settings.data.availability_starts_on,
          endsOn: settings.data.availability_ends_on,
        }
      : null
  const deadline = settings.data?.availability_deadline ?? null
  const events = useUpcomingEvents(ministry?.id, period)
  const answers = useMyAvailability(membership?.id)
  const setAnswer = useSetAvailability(membership?.id, church.id)
  const rehearsalAnswers = useMyRehearsalAvailability(membership?.id)
  const [filter, setFilter] = useState<AvailabilityFilterValue>('all')

  const answerBy = useMemo(
    () => new Map((answers.data ?? []).map((a) => [a.event_id, a.available])),
    [answers.data],
  )
  const months = useMemo(() => {
    const groups = new Map<string, UpcomingEvent[]>()
    for (const e of events.data ?? []) {
      if (!matchesAvailabilityFilter(filter, answerKind(answerBy.get(e.id)))) continue
      const label = monthFmt.format(new Date(e.starts_at))
      groups.set(label, [...(groups.get(label) ?? []), e])
    }
    return [...groups.entries()]
  }, [events.data, answerBy, filter])

  const unanswered = (events.data ?? []).filter((e) => !answerBy.has(e.id))
  const allYes = useMutation({
    mutationFn: async () => {
      for (const e of unanswered) await setAnswer.mutateAsync({ eventId: e.id, available: true })
    },
    onSuccess: () => toast.success('Marcado: você pode nos demais'),
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (events.error || answers.error) return <ErrorState error={events.error ?? answers.error} />
  if (!membership) {
    return (
      <PageHeader
        title="Disponibilidade"
        description={`Você não faz parte da equipe de ${ministry?.name ?? 'nenhum ministério'}.`}
      />
    )
  }
  if (settings.isPending) return <FullScreenLoader />
  if (!period) {
    return (
      <>
        <PageHeader
          eyebrow={onboarding ? 'PASSO 2 DE 3' : undefined}
          title="Disponibilidade"
          description={
            leader
              ? 'Nenhum período aberto. Abra o período em Configurações para você e a equipe responderem. Você também pode marcar “Posso / Não posso” direto na tela de cada culto.'
              : 'O líder ainda não abriu a programação para você responder. Quando abrir, as datas aparecem aqui.'
          }
        />
        {leader && !onboarding && (
          <Button asChild size="lg" className="min-h-12 rounded-2xl">
            <Link to="/configuracoes">Abrir período em Configurações</Link>
          </Button>
        )}
        {onboarding && (
          <Button
            size="lg"
            className="min-h-14 rounded-2xl text-[17px]"
            onClick={() => navigate('/instalar?inicio=1')}
          >
            Continuar
          </Button>
        )}
      </>
    )
  }
  if (events.isPending || answers.isPending) return <FullScreenLoader />

  const total = events.data.length
  return (
    <>
      <PageHeader
        eyebrow={
          onboarding
            ? 'PASSO 2 DE 3'
            : `${formatDate(period.startsOn)} A ${formatDate(period.endsOn)}`
        }
        title="Quando você pode servir?"
        description="Toque em “Posso” ou “Não posso” em cada culto (vale também para o ensaio dele) e diga em que dias consegue ensaiar. Se não responder, o líder pode escalar você normalmente."
      />
      {deadline && <p className="text-warning text-sm">Responda até {formatDate(deadline)}.</p>}

      {total === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ainda não há cultos cadastrados neste período. Volte aqui depois.
        </p>
      ) : (
        <div className="bg-card flex items-center justify-between gap-3 rounded-2xl border p-3.5">
          <span className="text-sm">
            <strong className="font-mono">{total - unanswered.length}</strong> de{' '}
            <span className="font-mono">{total}</span> respondidas
          </span>
          {unanswered.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={allYes.isPending}
              onClick={() => allYes.mutate()}
            >
              Posso em todas as outras
            </Button>
          )}
        </div>
      )}

      {total > 0 && (
        <AvailabilityFilter
          value={filter}
          onChange={setFilter}
          kinds={events.data.map((e) => answerKind(answerBy.get(e.id)))}
        />
      )}
      {total > 0 && months.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          {filter === 'none'
            ? 'Você já respondeu todas as datas.'
            : filter === 'yes'
              ? 'Nenhuma data marcada como “Posso”.'
              : 'Nenhuma data marcada como “Não posso”.'}
        </p>
      )}

      {months.map(([label, list]) => (
        <section key={label} className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {label}
          </h2>
          <ul className="flex flex-col gap-2">
            {list.map((e) => {
              const answer = answerBy.get(e.id)
              const busy = setAnswer.isPending && setAnswer.variables?.eventId === e.id
              const set = (value: boolean) =>
                setAnswer.mutate(
                  { eventId: e.id, available: answer === value ? null : value },
                  { onError: (err) => toast.error(errorMessage(err)) },
                )
              return (
                <li
                  key={e.id}
                  className={cn(
                    'bg-card flex flex-col gap-2.5 rounded-2xl border p-3.5',
                    answer === false && 'opacity-80',
                  )}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">
                      {formatEventDate(e.starts_at)}
                    </span>
                    <span className="text-muted-foreground text-[13px]">
                      {[
                        EVENT_KIND_LABEL[e.kind] !== e.title && EVENT_KIND_LABEL[e.kind],
                        e.title,
                        e.location_name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {e.rehearsals.map((r) => (
                      <span key={r.starts_at} className="text-info text-[13px] font-medium">
                        {r.name ?? 'Ensaio'}: {formatEventDate(r.starts_at)}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={answer === true}
                      disabled={busy}
                      onClick={() => set(true)}
                      className={cn(
                        'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold',
                        answer === true
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <Check className="size-4" aria-hidden="true" /> Posso
                    </button>
                    <button
                      type="button"
                      aria-pressed={answer === false}
                      disabled={busy}
                      onClick={() => set(false)}
                      className={cn(
                        'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold',
                        answer === false
                          ? 'border-destructive bg-destructive text-white'
                          : 'text-muted-foreground',
                      )}
                    >
                      <X className="size-4" aria-hidden="true" /> Não posso
                    </button>
                  </div>
                  {e.kind === 'service' && answer !== false && membership && (
                    <RehearsalAvailabilityField
                      key={rehearsalAnswers.data?.[e.id]?.note ?? ''}
                      serviceId={e.id}
                      answer={rehearsalAnswers.data?.[e.id]}
                      memberId={membership.id}
                      churchId={church.id}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {onboarding ? (
        <Button
          size="lg"
          className="min-h-14 rounded-2xl text-[17px]"
          onClick={() => navigate('/instalar?inicio=1')}
        >
          Continuar
        </Button>
      ) : (
        <Link to="/minhas-funcoes" className="text-muted-foreground text-center text-sm underline">
          Mudar meus instrumentos e vozes
        </Link>
      )}
    </>
  )
}
