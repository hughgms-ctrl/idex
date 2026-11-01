import { Link } from 'react-router'
import { ChevronRight, ListMusic, Mic2 } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { eventTimeRows, hhmm } from '@/features/schedule/datetime'
import { useSupportAgenda, type SupportService } from '@/features/support/queries'
import { teamByRole } from '@/features/support/support'
import { formatEventDate, relativeDays } from '@/lib/format'

// Agenda do apoio (som, data show…): só consulta.
export function SupportAgendaPage() {
  const { ministry, supports } = useChurch()
  const agenda = useSupportAgenda(ministry?.id)
  const label = supports.find((s) => s.ministry_id === ministry?.id)?.label

  return (
    <>
      <PageHeader
        eyebrow={label ? `APOIO · ${label.toUpperCase()}` : 'APOIO'}
        title={`Agenda do ${ministry?.name ?? 'ministério'}`}
        description="Horários dos cultos e ensaios, equipe e setlist com as cifras no tom de cada culto."
      />

      {agenda.error ? (
        <ErrorState error={agenda.error} onRetry={() => void agenda.refetch()} />
      ) : agenda.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : agenda.data.length === 0 ? (
        <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
          Nenhum culto marcado por enquanto.
        </Panel>
      ) : (
        <ul className="flex flex-col gap-3">
          {agenda.data.map((service) => (
            <li key={service.id}>
              <ServiceCard service={service} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ServiceCard({ service }: { service: SupportService }) {
  const team = teamByRole(service.team)
  return (
    <Link
      to={`/apoio/${service.id}`}
      className="bg-card hover:bg-secondary/40 flex flex-col gap-3 rounded-2xl border p-4 transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-primary text-xs font-semibold tracking-wider uppercase">
            {relativeDays(service.starts_at)}
          </span>
          <span className="truncate text-[17px] font-semibold">{service.title}</span>
          <span className="text-muted-foreground text-[13px]">
            {formatEventDate(service.starts_at)}
            {service.location_name ? ` · ${service.location_name}` : ''}
          </span>
        </div>
        <ChevronRight className="text-muted-foreground mt-1 size-5 shrink-0" aria-hidden="true" />
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] sm:grid-cols-3">
        {eventTimeRows({ kind: 'service', ...service }).map((row) => (
          <div key={row.label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-mono">{row.time}</dd>
          </div>
        ))}
      </dl>

      {service.rehearsals.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {service.rehearsals.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2">
              <Badge variant="outline" className="text-info border-info/40">
                <Mic2 aria-hidden="true" /> {r.group_name ? `Ensaio · ${r.group_name}` : 'Ensaio'}
              </Badge>
              <span>
                {formatEventDate(r.starts_at)}
                {r.arrive_at ? ` · chegada ${hhmm(r.arrive_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {team.length > 0 && (
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          {team.map((g) => (
            <span key={g.role} className="mr-3 inline-block">
              <span className="text-foreground">{g.role}:</span> {g.names.join(', ')}
            </span>
          ))}
        </p>
      )}

      <span className="text-muted-foreground flex items-center gap-1.5 text-[13px]">
        <ListMusic className="size-4" aria-hidden="true" />
        {service.songs === 0
          ? 'Setlist ainda não montada'
          : `${service.songs} ${service.songs === 1 ? 'música' : 'músicas'} na setlist`}
      </span>
    </Link>
  )
}
