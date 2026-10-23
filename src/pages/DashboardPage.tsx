import { Link } from 'react-router'
import { CalendarClock, QrCode, UserPlus } from 'lucide-react'

import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { useMinistryMembers } from '@/features/members/queries'
import { useMyProfile } from '@/features/profile/queries'
import { useMyUpcomingAssignments } from '@/features/schedule/queries'
import {
  useMinistryRoles,
  useMinistrySettings,
  useMyBalance,
  useNextEvent,
  useOpenCycle,
} from '@/features/ministries/queries'
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
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]))

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

      <Panel className="gap-4 rounded-[20px] p-[18px]">
        {nextEvent.isPending ? (
          <Skeleton className="h-16" />
        ) : event ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-primary text-xs font-semibold tracking-wider">
                {EVENT_KIND[event.kind] ?? 'PRÓXIMO EVENTO'}
              </span>
              <span className="font-display text-[22px] font-bold">
                {formatEventDate(event.starts_at)}
              </span>
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
        <Button size="lg" disabled className="min-h-14 rounded-2xl text-[17px]">
          <QrCode className="size-[22px]" aria-hidden="true" />
          Bater ponto com QR
        </Button>
        <p className="text-muted-foreground -mt-2 text-center text-xs">
          O check-in pelo QR chega na próxima etapa do app.
        </p>
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
