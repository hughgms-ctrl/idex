import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileCheck2 } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { kindForLedgerReason, openDiscount } from '@/features/attendance/justification-history'
import { attendanceKeys, LEDGER_REASON } from '@/features/attendance/queries'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Kind = 'late' | 'absence'
export type JustifyTarget = {
  memberId: string
  memberName: string
  eventId?: string
  kind?: Kind
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'aguardando análise',
  approved: 'aprovado',
  rejected: 'recusado',
}

/** Eventos do integrante (escalado ou com desconto) dos últimos 90 dias e próximos 60. */
function useMemberEventsForLeader(memberId: string | undefined) {
  return useQuery({
    queryKey: [...attendanceKeys.all, 'leader-member-events', memberId ?? ''],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const id = memberId ?? ''
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
      const until = new Date(Date.now() + 60 * 86_400_000).toISOString()
      const [assigned, ledger, justs] = await Promise.all([
        supabase
          .from('schedule_assignments')
          .select('events!inner(id, title, starts_at)')
          .eq('ministry_member_id', id)
          .gte('events.starts_at', since)
          .lte('events.starts_at', until),
        supabase
          .from('point_ledger')
          .select('delta, reason, note, events!inner(id, title, starts_at)')
          .eq('ministry_member_id', id)
          .gte('events.starts_at', since),
        supabase
          .from('justifications')
          .select('event_id, status, kind, reason')
          .eq('ministry_member_id', id),
      ])
      for (const r of [assigned, ledger, justs]) if (r.error) throw r.error
      const events = new Map<string, { id: string; title: string; starts_at: string }>()
      for (const a of assigned.data ?? []) events.set(a.events.id, a.events)
      for (const l of ledger.data ?? []) events.set(l.events.id, l.events)
      return [...events.values()]
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
        .map((e) => {
          const lines = (ledger.data ?? []).filter((l) => l.events.id === e.id)
          const discount = openDiscount(lines)
          const lastReason = lines.find((l) => l.reason === 'late' || l.reason === 'absence')
          return {
            event: e,
            discount,
            discountKind: lastReason ? kindForLedgerReason(lastReason.reason) : undefined,
            justification: (justs.data ?? []).find((j) => j.event_id === e.id) ?? null,
          }
        })
    },
  })
}

/**
 * O líder registra a justificativa por um integrante (ex.: estava no hospital).
 * Já entra aprovada; se o desconto já caiu, os pontos voltam.
 */
export function LeaderJustifyDialog({
  target,
  onClose,
}: {
  target: JustifyTarget | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {target && <LeaderJustifyForm key={target.memberId} target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function LeaderJustifyForm({ target, onClose }: { target: JustifyTarget; onClose: () => void }) {
  const queryClient = useQueryClient()
  const events = useMemberEventsForLeader(target.memberId)
  const list = events.data ?? []
  const [eventId, setEventId] = useState<string | undefined>(target.eventId)
  const chosenId =
    eventId ??
    list.find((x) => x.discount > 0 && x.justification?.status !== 'approved')?.event.id ??
    list[0]?.event.id
  const chosen = list.find((x) => x.event.id === chosenId)
  const [kind, setKind] = useState<Kind | undefined>(target.kind)
  const effectiveKind: Kind =
    kind ?? chosen?.discountKind ?? chosen?.justification?.kind ?? 'absence'
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const alreadyApproved = chosen?.justification?.status === 'approved'

  const save = useMutation({
    mutationFn: async () => {
      if (!chosenId) return
      const { error: err } = await supabase.rpc('leader_register_justification', {
        p_event_id: chosenId,
        p_ministry_member_id: target.memberId,
        p_kind: effectiveKind,
        p_reason: reason.trim(),
      })
      if (err) throw err
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: attendanceKeys.all })
      toast.success(
        chosen && chosen.discount > 0
          ? `Justificativa registrada: ${chosen.discount} pontos devolvidos`
          : 'Justificativa registrada e aprovada',
      )
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Justificar por {target.memberName}</DialogTitle>
        <DialogDescription>
          Para quando a pessoa não conseguiu avisar (ex.: estava no hospital). Já entra aprovada; se
          o desconto já caiu, os pontos voltam. Fica no histórico com o seu nome.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        {events.isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : list.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum culto ou ensaio desta pessoa nos últimos 90 dias.
          </p>
        ) : (
          <FormField id="lj-event" label="Culto ou ensaio">
            <NativeSelect
              id="lj-event"
              value={chosenId ?? ''}
              onChange={(e) => {
                setEventId(e.target.value)
                setKind(undefined)
              }}
            >
              {list.map((x) => (
                <option key={x.event.id} value={x.event.id}>
                  {formatEventDate(x.event.starts_at)} · {x.event.title}
                  {x.discount > 0 ? ` · −${x.discount}` : ''}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        {chosen?.justification && (
          <p
            className={cn(
              'rounded-xl border px-3 py-2 text-[13px]',
              alreadyApproved ? 'border-primary/50' : 'border-info/60',
            )}
          >
            Já existe aviso de {chosen.justification.kind === 'late' ? 'atraso' : 'falta'} (
            {STATUS_TEXT[chosen.justification.status] ?? chosen.justification.status}): “
            {chosen.justification.reason}”.
            {alreadyApproved
              ? ' Nada a fazer.'
              : ' Ao salvar, ele é aprovado com o motivo abaixo (o original fica no histórico).'}
          </p>
        )}
        {chosen && chosen.discount > 0 && !alreadyApproved && (
          <p className="text-muted-foreground text-[13px]">
            Desconto neste evento: <strong className="text-warning">−{chosen.discount}</strong>.
            Volta ao salvar.
          </p>
        )}
        <FormField id="lj-kind" label="Tipo">
          <NativeSelect
            id="lj-kind"
            value={effectiveKind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="absence">Falta</option>
            <option value="late">Atraso</option>
          </NativeSelect>
        </FormField>
        <FormField id="lj-reason" label="Motivo">
          <Input
            id="lj-reason"
            value={reason}
            maxLength={300}
            placeholder="Ex.: estava internada; avisou por telefone"
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <DialogFooter>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || reason.trim().length < 3 || !chosenId || alreadyApproved}
        >
          {save.isPending ? 'Salvando…' : 'Registrar e aprovar'}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Extrato do integrante no ciclo (visão do líder) com atalho para justificar. */
export function MemberPointsDialog({
  member,
  cycleId,
  onClose,
  onJustify,
}: {
  member: { id: string; name: string } | null
  cycleId: string | undefined
  onClose: () => void
  onJustify: (t: JustifyTarget) => void
}) {
  const ledger = useQuery({
    queryKey: [...attendanceKeys.all, 'leader-ledger', member?.id ?? '', cycleId ?? ''],
    enabled: Boolean(member && cycleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('point_ledger')
        .select('id, delta, reason, note, created_at, event_id, events(title, starts_at)')
        .eq('ministry_member_id', member?.id ?? '')
        .eq('cycle_id', cycleId ?? '')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
  const rows = useMemo(() => ledger.data ?? [], [ledger.data])
  const byEvent = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (!r.event_id || m.has(r.event_id)) continue
      m.set(r.event_id, openDiscount(rows.filter((x) => x.event_id === r.event_id)))
    }
    return m
  }, [rows])
  const balance = rows.reduce((s, r) => s + r.delta, 0)

  return (
    <Dialog open={Boolean(member)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member?.name}</DialogTitle>
          <DialogDescription>
            Saldo no ciclo: <strong className="font-mono">{balance}</strong>
          </DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 flex max-h-[55vh] flex-col overflow-y-auto">
          {rows.map((r) => {
            const discountLine = r.reason === 'late' || r.reason === 'absence'
            const open = discountLine && r.event_id ? (byEvent.get(r.event_id) ?? 0) > 0 : false
            return (
              <li
                key={r.id}
                className="flex items-start gap-3 border-b px-1 py-2.5 last:border-b-0"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm">{r.note || LEDGER_REASON[r.reason] || r.reason}</span>
                  <span className="text-muted-foreground text-xs">
                    {r.events
                      ? `${r.events.title} · ${formatEventDate(r.events.starts_at)}`
                      : formatDateTime(r.created_at)}
                  </span>
                  {open && member && r.event_id && (
                    <button
                      type="button"
                      className="text-primary mt-1 min-h-8 self-start text-[13px] font-medium underline"
                      onClick={() =>
                        onJustify({
                          memberId: member.id,
                          memberName: member.name,
                          eventId: r.event_id ?? undefined,
                          kind: kindForLedgerReason(r.reason),
                        })
                      }
                    >
                      Justificar e devolver pontos
                    </button>
                  )}
                </span>
                <span
                  className={cn(
                    'font-mono text-sm font-semibold',
                    r.delta < 0 ? 'text-warning' : 'text-primary',
                  )}
                >
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => member && onJustify({ memberId: member.id, memberName: member.name })}
          >
            <FileCheck2 aria-hidden="true" /> Registrar justificativa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
