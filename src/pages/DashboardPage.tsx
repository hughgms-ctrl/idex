import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarCheck, Check, ChevronRight, Guitar, UserPlus } from 'lucide-react'

import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { MarginText, StreakLine } from '@/features/attendance/Gamification'
import { useMyAvailability, useMyRoleIds, useUpcomingEvents } from '@/features/availability/queries'
import { PresenceCard } from '@/features/attendance/PresenceCard'
import { useChurch } from '@/features/church/church-context'
import { PushCard } from '@/features/push/PushCard'
import { useMinistryMembers } from '@/features/members/queries'
import { useMyProfile } from '@/features/profile/queries'
import { useMyUpcomingAssignments } from '@/features/schedule/queries'
import { useNextServices, useSetlist } from '@/features/songs/queries'
import { useOfflineNextSetlist } from '@/features/songs/useOfflineNextSetlist'
import {
  useMinistryRoles,
  useMinistrySettings,
  useMyBalance,
  useNextEvent,
  useOpenCycle,
} from '@/features/ministries/queries'
import { formatDate, formatDayMonth, formatEventDate, relativeDays } from '@/lib/format'

export function DashboardPage() {
  const { church, ministry, memberships, isLeader } = useChurch()
  const profile = useMyProfile()
  const nextEvent = useNextEvent(ministry?.id)
  const settings = useMinistrySettings(ministry?.id)
  const cycle = useOpenCycle(ministry?.id)
  const myMembership = memberships.find((m) => m.ministry_id === ministry?.id)
  const balance = useMyBalance(myMembership?.id, cycle.data?.id)
  const leader = ministry ? isLeader(ministry.id) : false
  const members = useMinistryMembers(leader ? ministry?.id : undefined)
  const myAssignments = useMyUpcomingAssignments(myMembership?.id)
  const roles = useMinistryRoles(ministry?.id)
  const nextServices = useNextServices(ministry?.id, 1)
  const nextService = nextServices.data?.[0]
  const setlist = useSetlist(nextService?.id)
  useOfflineNextSetlist(nextService?.id)
  const setlistItems = setlist.data?.setlist_items ?? []
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]))

  const myRoleIds = useMyRoleIds(myMembership?.id)
  const period =
    settings.data?.availability_starts_on && settings.data.availability_ends_on
      ? {
          startsOn: settings.data.availability_starts_on,
          endsOn: settings.data.availability_ends_on,
        }
      : null
  const periodEvents = useUpcomingEvents(myMembership ? ministry?.id : undefined, period)
  const myAnswers = useMyAvailability(myMembership?.id)
  const answered = new Set((myAnswers.data ?? []).map((a) => a.event_id))
  const pendingAnswers = myAnswers.data
    ? (periodEvents.data ?? []).filter((e) => !answered.has(e.id)).length
    : 0

  const toConfirm = myAssignments.data?.find((a) => a.status === 'scheduled')

  const firstName = profile.data?.full_name.split(' ')[0]
  const event = nextEvent.data

  return (
    <>
      <h1 className="font-display text-[28px] leading-tight font-medium">
        {firstName ? `Olá, ${firstName}.` : 'Olá!'}
        {event && (
          <>
            <br />
            {event.kind === 'rehearsal' ? 'Ensaio' : event.title} {relativeDays(event.starts_at)}.
          </>
        )}
      </h1>

      {myMembership && myRoleIds.data?.length === 0 && (
        <TodoCard
          to="/minhas-funcoes"
          icon={<Guitar className="text-primary size-5" aria-hidden="true" />}
          title="Escolha seus instrumentos e vozes"
          text="O líder usa isso para montar a escala."
        />
      )}
      {pendingAnswers > 0 && (
        <TodoCard
          to="/disponibilidade"
          icon={<CalendarCheck className="text-primary size-5" aria-hidden="true" />}
          title="Responda sua disponibilidade"
          text={`${pendingAnswers} ${pendingAnswers === 1 ? 'data sem resposta' : 'datas sem resposta'}${settings.data?.availability_deadline ? ` · até ${formatDate(settings.data.availability_deadline)}` : ''}.`}
        />
      )}

      {toConfirm && (
        <TodoCard
          to={`/confirmar/${toConfirm.events.service_event_id ?? toConfirm.events.id}`}
          icon={<CalendarCheck className="text-primary size-5" aria-hidden="true" />}
          title="Confirme sua presença"
          text={`${toConfirm.events.kind === 'rehearsal' ? 'Ensaio' : toConfirm.events.title} · ${formatEventDate(toConfirm.events.starts_at)}`}
        />
      )}

      <PresenceCard
        churchId={church.id}
        memberId={myMembership?.id}
        ministryEvent={event}
        ministryEventLoading={nextEvent.isPending}
        settings={settings.data ?? null}
      />

      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="Sua escala"
          action={
            <Link to="/escalas" className="text-primary text-sm">
              Ver mês
            </Link>
          }
        />
        {myAssignments.data && myAssignments.data.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2.5">
            {myAssignments.data.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/confirmar/${a.events.service_event_id ?? a.events.id}`}
                  className="bg-card flex h-full flex-col gap-1 rounded-2xl border p-3"
                >
                  <span className="text-muted-foreground flex items-center justify-between font-mono text-[13px]">
                    {formatDayMonth(a.events.starts_at)}
                    {a.status === 'confirmed' && (
                      <Check className="text-primary size-4" aria-label="Confirmado" />
                    )}
                  </span>
                  <span className="truncate text-[15px] font-semibold">
                    {(a.ministry_role_id && roleName.get(a.ministry_role_id)) || 'Equipe'}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">{a.events.title}</span>
                  {a.status === 'scheduled' && (
                    <span className="text-primary text-xs font-semibold">Confirmar</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {myAssignments.isPending
              ? 'Carregando…'
              : 'Você não está escalado nos próximos eventos.'}
          </p>
        )}
      </section>

      {nextService && (
        <section className="flex flex-col gap-2.5">
          <SectionTitle
            title={`Repertório · ${formatDayMonth(nextService.starts_at)}`}
            action={
              <Link to={`/repertorio/culto/${nextService.id}`} className="text-primary text-sm">
                {setlistItems.length ? `${setlistItems.length} músicas` : 'Ver setlist'}
              </Link>
            }
          />
          {setlistItems.length > 0 ? (
            <ol className="bg-card flex flex-col overflow-hidden rounded-2xl border">
              {setlistItems.map((item, i) => (
                <li key={item.id} className="border-b last:border-b-0">
                  <Link
                    to={`/repertorio/${item.song_id}?culto=${nextService.id}${item.key ? `&tom=${encodeURIComponent(item.key)}` : ''}`}
                    className="flex min-h-11 items-center gap-3 px-3.5 py-3"
                  >
                    <span className="text-muted-foreground w-[18px] font-mono text-[13px]">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate text-[15px]">{item.songs?.title}</span>
                    <span className="bg-secondary text-primary rounded-lg px-2 py-1 font-mono text-[13px] font-semibold">
                      {item.key ?? item.songs?.original_key ?? '—'}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              O setlist deste culto ainda não foi montado.
            </p>
          )}
        </section>
      )}

      <Panel>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Pontos no ciclo</h2>
          <span className="font-mono text-[15px]">
            {balance.data ? (
              <>
                <span className="text-primary">{balance.data.balance}</span>
                {settings.data && ` / ${settings.data.cycle_starting_points}`}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
        {balance.data && settings.data && (
          <div className="bg-border h-2 overflow-hidden rounded">
            <div
              className={
                balance.data.balance >= settings.data.cycle_min_points
                  ? 'bg-primary h-2'
                  : 'bg-warning h-2'
              }
              style={{
                width: `${Math.max(0, Math.min(100, (balance.data.balance / settings.data.cycle_starting_points) * 100))}%`,
              }}
            />
          </div>
        )}
        {balance.data && settings.data && (
          <MarginText balance={balance.data.balance} settings={settings.data} />
        )}
        <p className="text-muted-foreground text-[13px]">
          {cycle.data && settings.data
            ? `Ciclo de ${formatDate(cycle.data.starts_on)} a ${formatDate(cycle.data.ends_on)}. Com ${settings.data.cycle_min_points} pontos ou mais no fechamento, você continua na escala do próximo ciclo.`
            : 'Nenhum ciclo aberto.'}
        </p>
        {myMembership && <StreakLine memberId={myMembership.id} settings={settings.data ?? null} />}
      </Panel>

      <PushCard compact />

      {leader && (
        <Panel>
          <SectionTitle
            title="Equipe"
            action={
              <Link to="/membros" className="text-primary text-sm">
                Ver todos
              </Link>
            }
          />
          <p className="text-muted-foreground text-sm">
            {members.data
              ? `${members.data.filter((m) => m.status === 'active').length} integrantes ativos em ${ministry?.name}.`
              : 'Carregando…'}
          </p>
          <Button asChild variant="outline" className="self-start">
            <Link to="/membros?convidar=1">
              <UserPlus aria-hidden="true" /> Convidar integrante
            </Link>
          </Button>
        </Panel>
      )}
    </>
  )
}

function TodoCard({
  to,
  icon,
  title,
  text,
}: {
  to: string
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <Link
      to={to}
      className="border-primary/50 bg-card flex min-h-14 items-center gap-3 rounded-2xl border p-3.5"
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-muted-foreground text-[13px]">{text}</span>
      </span>
      <ChevronRight className="text-muted-foreground size-5" aria-hidden="true" />
    </Link>
  )
}
