import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarCheck, CalendarClock, ChevronRight, Guitar, QrCode, UserPlus } from 'lucide-react'

import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyAvailability, useMyRoleIds, useUpcomingEvents } from '@/features/availability/queries'
import { useChurch } from '@/features/church/church-context'
import { eventTimeRows } from '@/features/schedule/datetime'
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
import { cn } from '@/lib/utils'
import { formatDate, formatDayMonth, formatEventDate, relativeDays } from '@/lib/format'

const EVENT_KIND: Record<string, string> = {
  service: 'PRÓXIMO CULTO',
  rehearsal: 'PRÓXIMO ENSAIO',
  other: 'PRÓXIMO EVENTO',
}

export function DashboardPage() {
  const { ministry, memberships, isLeader } = useChurch()
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

      <Panel className="gap-4 rounded-[20px] p-[18px]">
        {nextEvent.isPending ? (
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
                {EVENT_KIND[event.kind] ?? 'PRÓXIMO EVENTO'}
              </span>
              <span className="font-display text-[22px] font-bold">
                {formatEventDate(event.starts_at)}
              </span>
              {event.arrive_at && (
                <span className="text-sm">
                  {eventTimeRows(event, settings.data)
                    .filter((r) => r.label !== 'Início' && r.label !== 'Início do ensaio')
                    .map((r) => `${r.label.replace(' (tolerância)', '')} ${r.time}`)
                    .join(' · ')}
                </span>
              )}
              <span className="text-muted-foreground text-sm">
                {[event.location_name, event.title].filter(Boolean).join(' · ')}
                {settings.data && ` · tolerância de ${settings.data.late_tolerance_min} min`}
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
        <Button asChild size="lg" className="min-h-14 rounded-2xl text-[17px]">
          <Link to="/presenca/checkin">
            <QrCode className="size-[22px]" aria-hidden="true" />
            Bater ponto
          </Link>
        </Button>
        {event && (
          <Link
            to={`/presenca?justificar=${event.id}`}
            className="text-muted-foreground text-center text-sm underline"
          >
            Vou me atrasar — avisar o líder
          </Link>
        )}
      </Panel>

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
              <li key={a.id} className="bg-card flex flex-col gap-1 rounded-2xl border p-3">
                <span className="text-muted-foreground font-mono text-[13px]">
                  {formatDayMonth(a.events.starts_at)}
                </span>
                <span className="truncate text-[15px] font-semibold">
                  {(a.ministry_role_id && roleName.get(a.ministry_role_id)) || 'Equipe'}
                </span>
                <span className="text-muted-foreground truncate text-xs">{a.events.title}</span>
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
        <p className="text-muted-foreground text-[13px]">
          {cycle.data && settings.data
            ? `Ciclo de ${formatDate(cycle.data.starts_on)} a ${formatDate(cycle.data.ends_on)}. Com ${settings.data.cycle_min_points} pontos ou mais no fechamento, você continua na escala do próximo ciclo.`
            : 'Nenhum ciclo aberto.'}
        </p>
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
