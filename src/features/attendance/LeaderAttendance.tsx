import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, MonitorUp } from 'lucide-react'

import { Panel } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  attendanceKeys,
  useLeaderEvents,
  useLiveAttendance,
  useMinistryBalances,
  usePendingReviews,
} from '@/features/attendance/queries'
import { liveStatus, type LiveTone } from '@/features/attendance/status'
import type { MinistryMemberRow } from '@/features/members/queries'
import { fromLocalInputs, toLocalInputs } from '@/features/schedule/datetime'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatEventDate, initials } from '@/lib/format'
import { invokeFunction } from '@/lib/functions'
import { supabase } from '@/lib/supabase'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'

const TONE: Record<LiveTone, string> = {
  ok: 'bg-primary text-primary-foreground',
  late: 'bg-warning text-primary-foreground',
  justified: 'bg-info text-primary-foreground',
  absent: 'border border-warning text-foreground',
  waiting: 'border text-muted-foreground',
  pending: 'border border-info text-foreground',
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
})

export function LiveEventPanel({
  ministryId,
  members,
  roleName,
  settings,
}: {
  ministryId: string
  members: MinistryMemberRow[]
  roleName: Map<string, string>
  settings: Tables<'ministry_settings'> | null
}) {
  const events = useLeaderEvents(ministryId, true)
  const list = events.data ?? []
  // padrão: evento em andamento ou o próximo; senão o último
  const now = useNow(15_000)
  const current =
    list.find((e) => {
      const s = Date.parse(e.starts_at)
      const end = e.ends_at ? Date.parse(e.ends_at) : s + 7_200_000
      return s - 7_200_000 <= now && now <= end
    }) ??
    list.find((e) => Date.parse(e.starts_at) > now) ??
    list[list.length - 1]
  const [selected, setSelected] = useState<string | null>(null)
  const eventId = selected ?? current?.id
  const event = list.find((e) => e.id === eventId)
  const live = useLiveAttendance(eventId)

  if (events.isPending) return <p className="text-muted-foreground text-sm">Carregando…</p>
  if (!event) {
    return (
      <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
        Nenhum culto ou ensaio nos últimos 2 dias nem nos próximos 7.
      </Panel>
    )
  }

  const tolerance = settings?.late_tolerance_min ?? 10
  const start = Date.parse(event.starts_at)
  const ended = now > (event.ends_at ? Date.parse(event.ends_at) : start + 7_200_000)
  const rows = (live.data?.assignments ?? [])
    .filter(
      (a, i, arr) => arr.findIndex((b) => b.ministry_member_id === a.ministry_member_id) === i,
    )
    .map((a) => {
      const member = members.find((m) => m.id === a.ministry_member_id)
      const status = live.data
        ? liveStatus({
            memberId: a.ministry_member_id,
            data: live.data,
            eventEnded: ended,
            toleranceMin: tolerance,
          })
        : null
      return { a, member, status }
    })
    .sort((x, y) => (x.status?.time ?? 'z').localeCompare(y.status?.time ?? 'z'))
  const counts = {
    ok: rows.filter((r) => r.status?.tone === 'ok').length,
    late: rows.filter((r) => r.status?.tone === 'late').length,
    justified: rows.filter((r) => r.status?.tone === 'justified').length,
    absent: rows.filter((r) => r.status?.tone === 'absent' || r.status?.tone === 'waiting').length,
  }

  return (
    <>
      <NativeSelect
        aria-label="Evento"
        value={event.id}
        onChange={(e) => setSelected(e.target.value)}
      >
        {list.map((e) => (
          <option key={e.id} value={e.id}>
            {formatEventDate(e.starts_at)} · {e.title}
          </option>
        ))}
      </NativeSelect>
      <p className="text-muted-foreground -mt-2 text-sm">
        Início {timeFmt.format(new Date(event.starts_at))} · tolerância {tolerance} min
        {!ended && now >= start ? ' · ao vivo' : ''}
      </p>

      <div className="grid grid-cols-4 gap-2">
        {[
          { n: counts.ok, label: 'no horário', cls: 'text-primary' },
          { n: counts.late, label: 'atrasados', cls: 'text-warning' },
          { n: counts.justified, label: 'justificou', cls: 'text-info' },
          { n: counts.absent, label: ended ? 'faltou' : 'faltam', cls: '' },
        ].map((c) => (
          <div
            key={c.label}
            className="bg-card flex flex-col items-center gap-0.5 rounded-[14px] border px-1 py-2.5"
          >
            <span className={cn('font-mono text-[22px] font-semibold', c.cls)}>{c.n}</span>
            <span className="text-muted-foreground text-xs">{c.label}</span>
          </div>
        ))}
      </div>

      <Button asChild size="lg" className="min-h-[52px] rounded-2xl">
        <Link to={`/presenca/qr/${event.id}`}>
          <MonitorUp aria-hidden="true" /> Projetar QR no telão
        </Link>
      </Button>

      {rows.length === 0 ? (
        <Panel className="text-muted-foreground items-center py-6 text-center text-sm">
          Ninguém escalado neste evento.{' '}
          <Link to={`/escalas/${event.id}`} className="text-primary underline">
            Montar escala
          </Link>
        </Panel>
      ) : (
        <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          {rows.map(({ a, member, status }) => (
            <li
              key={a.ministry_member_id}
              className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0"
            >
              <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">
                {initials(member?.name ?? '?')}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{member?.name ?? '—'}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {(a.ministry_role_id && roleName.get(a.ministry_role_id)) || 'Equipe'}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <span className="font-mono text-sm">
                  {status?.time ? timeFmt.format(new Date(status.time)) : '—'}
                </span>
                {status && (
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                      TONE[status.tone],
                    )}
                  >
                    {status.label}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const ATTEMPT_LABEL: Record<string, string> = {
  ok: 'check-in aceito',
  outside_radius: 'fora do raio',
  invalid_qr: 'QR expirado',
  no_location: 'igreja sem localização',
  not_scheduled: 'não escalado',
  out_of_time: 'fora do horário',
}

export function PendingReviews({ ministryId, limit }: { ministryId: string; limit: number }) {
  const queryClient = useQueryClient()
  const pending = usePendingReviews(ministryId, true)
  const [adjusting, setAdjusting] = useState<{ id: string; time: string; date: string } | null>(
    null,
  )
  const invalidate = () => queryClient.invalidateQueries({ queryKey: attendanceKeys.all })

  const review = useMutation({
    mutationFn: (body: {
      requestId: string
      decision: 'approve' | 'reject' | 'adjust'
      arrivedAt?: string
    }) => invokeFunction('review-checkin-request', body),
    onSuccess: async () => {
      setAdjusting(null)
      await invalidate()
      toast.success('Pedido analisado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const reviewJust = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc('review_justification', {
        p_justification_id: id,
        p_approve: approve,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Aviso analisado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (pending.isPending) return <p className="text-muted-foreground text-sm">Carregando…</p>
  const requests = pending.data?.requests ?? []
  const justifications = pending.data?.justifications ?? []
  if (requests.length + justifications.length === 0) {
    return (
      <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
        Nenhum pedido ou aviso esperando sua análise.
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => {
        const evidence = (r.evidence ?? {}) as {
          over_limit?: boolean
          requests_in_cycle_before?: number
        }
        const attempts = (pending.data?.attempts ?? []).filter(
          (a) => a.event_id === r.event_id && a.ministry_member_id === r.ministry_member_id,
        )
        const name = r.ministry_members?.profiles?.full_name ?? 'Integrante'
        return (
          <Panel key={r.id} className="gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-info text-xs font-semibold tracking-wider">
                ESQUECI DE REGISTRAR
              </span>
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground text-xs">
                {r.events.title} · {formatEventDate(r.events.starts_at)}
              </span>
            </div>
            <p className="text-sm">
              Diz que chegou às{' '}
              <strong className="font-mono">
                {timeFmt.format(new Date(r.declared_arrived_at))}
              </strong>
              : “{r.reason}”
            </p>
            {evidence.over_limit && (
              <p className="border-warning flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px]">
                <AlertCircle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Já é o {(evidence.requests_in_cycle_before ?? 0) + 1}º pedido neste ciclo (limite:{' '}
                {limit}).
              </p>
            )}
            <div className="text-muted-foreground text-[13px]">
              <span className="text-foreground font-medium">Evidências: </span>
              {attempts.length === 0
                ? 'nenhuma tentativa de check-in registrada pelo app.'
                : attempts
                    .map(
                      (a) =>
                        `${timeFmt.format(new Date(a.attempted_at))} ${ATTEMPT_LABEL[a.outcome] ?? a.outcome}${a.distance_m != null ? ` (a ${Math.round(a.distance_m)} m)` : ''}`,
                    )
                    .join(' · ')}
            </div>
            {adjusting?.id === r.id ? (
              <div className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Horário de chegada
                  <Input
                    type="time"
                    value={adjusting.time}
                    onChange={(e) => setAdjusting({ ...adjusting, time: e.target.value })}
                  />
                </label>
                <Button
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate({
                      requestId: r.id,
                      decision: 'adjust',
                      arrivedAt: fromLocalInputs(adjusting.date, adjusting.time).toISOString(),
                    })
                  }
                >
                  Confirmar
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ requestId: r.id, decision: 'approve' })}
                >
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAdjusting({ id: r.id, ...toLocalInputs(r.declared_arrived_at) })
                  }
                >
                  Ajustar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={review.isPending}
                  onClick={() => {
                    if (window.confirm(`Recusar? Conta como falta para ${name}.`)) {
                      review.mutate({ requestId: r.id, decision: 'reject' })
                    }
                  }}
                >
                  Recusar
                </Button>
              </div>
            )}
          </Panel>
        )
      })}

      {justifications.map((j) => (
        <Panel key={j.id} className="gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-info text-xs font-semibold tracking-wider">
              AVISO DE {j.kind === 'late' ? 'ATRASO' : 'FALTA'}
            </span>
            <span className="font-medium">
              {j.ministry_members?.profiles?.full_name ?? 'Integrante'}
            </span>
            <span className="text-muted-foreground text-xs">
              {j.events.title} · {formatEventDate(j.events.starts_at)} · enviado{' '}
              {formatDateTime(j.created_at)}
            </span>
          </div>
          <p className="text-sm">“{j.reason}”</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              disabled={reviewJust.isPending}
              onClick={() => reviewJust.mutate({ id: j.id, approve: true })}
            >
              Aprovar (sem desconto)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={reviewJust.isPending}
              onClick={() => reviewJust.mutate({ id: j.id, approve: false })}
            >
              Recusar
            </Button>
          </div>
        </Panel>
      ))}
    </div>
  )
}

export function TeamBalances({
  ministryId,
  cycleId,
  members,
  minPoints,
}: {
  ministryId: string
  cycleId: string | undefined
  members: MinistryMemberRow[]
  minPoints: number
}) {
  const balances = useMinistryBalances(ministryId, cycleId, true)
  const rows = members
    .filter((m) => m.status === 'active')
    .map((m) => ({ m, b: balances.data?.find((b) => b.ministry_member_id === m.id) }))
    .sort((x, y) => (x.b?.balance ?? 0) - (y.b?.balance ?? 0))

  return (
    <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
      {rows.map(({ m, b }) => {
        const value = b?.balance ?? 0
        return (
          <li key={m.id} className="flex items-center gap-3 border-b px-3.5 py-2.5 last:border-b-0">
            <span className="flex-1 truncate text-[15px]">{m.name}</span>
            {(b?.penalties ?? 0) > 0 && (
              <span className="text-muted-foreground text-xs">{b?.penalties} desc.</span>
            )}
            <span
              className={cn(
                'font-mono text-[15px] font-semibold',
                value >= minPoints ? 'text-primary' : 'text-warning',
              )}
            >
              {value}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
