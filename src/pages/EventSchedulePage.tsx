import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, ArrowLeft, Copy, Pencil, Trash2, X } from 'lucide-react'
import { assignmentConflicts, suggestSubstitutes } from '@domain/schedule.ts'
import { localParts } from '@domain/time.ts'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useChurch } from '@/features/church/church-context'
import { EVENT_KIND_LABEL } from '@/features/schedule/datetime'
import { EventDialog } from '@/features/schedule/EventDialog'
import { scheduleKeys, useEvent, type ScheduleEvent } from '@/features/schedule/queries'
import { useScheduleData, type ScheduleData } from '@/features/schedule/useScheduleData'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'

export function EventSchedulePage() {
  const { eventId = '' } = useParams()
  const { ministry, isLeader } = useChurch()
  const eventQuery = useEvent(eventId)
  const event = eventQuery.data
  const p = event ? localParts(event.starts_at) : localParts(new Date())
  const data = useScheduleData(event?.ministry_id, p.year, p.month)

  if (eventQuery.error) return <ErrorState error={eventQuery.error} />
  if (eventQuery.isPending || data.isPending) return <FullScreenLoader />
  if (!event || !ministry) {
    return (
      <>
        <PageHeader title="Evento não encontrado" />
        <Button asChild variant="outline" className="self-start">
          <Link to="/escalas">Voltar para a escala</Link>
        </Button>
      </>
    )
  }
  // A versão do evento dentro dos dados do mês tem as escalas atualizadas
  const current = data.events.find((e) => e.id === event.id) ?? event
  return <Editor event={current} data={data} canEdit={isLeader(event.ministry_id)} />
}

function Editor({
  event,
  data,
  canEdit,
}: {
  event: ScheduleEvent
  data: ScheduleData
  canEdit: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { ministry } = useChurch()
  const [editOpen, setEditOpen] = useState(false)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: scheduleKeys.all })

  const add = useMutation({
    mutationFn: async ({ memberId, roleId }: { memberId: string; roleId: string | null }) => {
      const { error } = await supabase.from('schedule_assignments').insert({
        church_id: event.church_id,
        event_id: event.id,
        ministry_member_id: memberId,
        ministry_role_id: roleId,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from('schedule_assignments').delete().eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const swap = useMutation({
    mutationFn: async ({ assignmentId, memberId }: { assignmentId: string; memberId: string }) => {
      const { error } = await supabase
        .from('schedule_assignments')
        .update({ ministry_member_id: memberId })
        .eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Substituto escalado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const copyFrom = useMutation({
    mutationFn: async (sourceId: string) => {
      const source = data.events.find((e) => e.id === sourceId)
      if (!source) return 0
      const existing = new Set(
        event.schedule_assignments.map((a) => `${a.ministry_member_id}:${a.ministry_role_id}`),
      )
      const rows = source.schedule_assignments
        .filter((a) => !existing.has(`${a.ministry_member_id}:${a.ministry_role_id}`))
        .map((a) => ({
          church_id: event.church_id,
          event_id: event.id,
          ministry_member_id: a.ministry_member_id,
          ministry_role_id: a.ministry_role_id,
        }))
      if (rows.length === 0) return 0
      const { error } = await supabase.from('schedule_assignments').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: async (count) => {
      await invalidate()
      toast.success(count ? `${count} pessoas copiadas` : 'Nada novo para copiar')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const removeEvent = useMutation({
    mutationFn: async (scope: 'one' | 'following') => {
      if (scope === 'one') {
        const { error } = await supabase.from('events').delete().eq('id', event.id)
        if (error) throw error
        return
      }
      const parentId = event.recurrence_parent_id ?? event.id
      const { error } = await supabase
        .from('events')
        .delete()
        .or(`id.eq.${parentId},recurrence_parent_id.eq.${parentId}`)
        .gte('starts_at', event.starts_at)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Evento removido')
      navigate('/escalas')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const isSeries = Boolean(event.recurrence_parent_id || event.recurrence_rule)
  const otherEvents = data.events.filter(
    (e) => e.id !== event.id && e.schedule_assignments.length > 0,
  )

  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link to="/escalas">
          <ArrowLeft aria-hidden="true" /> Escala
        </Link>
      </Button>
      <PageHeader
        eyebrow={EVENT_KIND_LABEL[event.kind]?.toUpperCase()}
        title={event.title}
        description={[formatEventDate(event.starts_at), event.location_name]
          .filter(Boolean)
          .join(' · ')}
        action={
          canEdit && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Editar evento"
              onClick={() => setEditOpen(true)}
            >
              <Pencil />
            </Button>
          )
        }
      />

      {data.roles.map((role) => {
        const inRole = event.schedule_assignments.filter((a) => a.ministry_role_id === role.id)
        return (
          <RoleSlot
            key={role.id}
            roleId={role.id}
            roleName={role.name}
            assignments={inRole}
            event={event}
            data={data}
            canEdit={canEdit}
            onAdd={(memberId) => add.mutate({ memberId, roleId: role.id })}
            onRemove={(id) => remove.mutate(id)}
            onSwap={(assignmentId, memberId) => swap.mutate({ assignmentId, memberId })}
          />
        )
      })}

      {canEdit && otherEvents.length > 0 && (
        <Panel>
          <SectionTitle title="Copiar escala" />
          <p className="text-muted-foreground text-[13px]">
            Útil para o ensaio: traz as mesmas pessoas e funções de outro evento do mês.
          </p>
          <div className="flex gap-2">
            <NativeSelect
              aria-label="Copiar de"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) copyFrom.mutate(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Escolha o evento…</option>
              {otherEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatEventDate(e.starts_at)} · {e.title}
                </option>
              ))}
            </NativeSelect>
            <Copy className="text-muted-foreground mt-3 size-4 shrink-0" aria-hidden="true" />
          </div>
        </Panel>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={removeEvent.isPending}
            onClick={() => {
              if (window.confirm('Apagar este evento e a escala dele?')) removeEvent.mutate('one')
            }}
          >
            <Trash2 aria-hidden="true" /> Apagar evento
          </Button>
          {isSeries && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={removeEvent.isPending}
              onClick={() => {
                if (window.confirm('Apagar este e os próximos eventos da repetição?')) {
                  removeEvent.mutate('following')
                }
              }}
            >
              Apagar este e os próximos
            </Button>
          )}
        </div>
      )}

      {canEdit && ministry && (
        <EventDialog open={editOpen} onOpenChange={setEditOpen} ministry={ministry} event={event} />
      )}
    </>
  )
}

function RoleSlot({
  roleId,
  roleName,
  assignments,
  event,
  data,
  canEdit,
  onAdd,
  onRemove,
  onSwap,
}: {
  roleId: string
  roleName: string
  assignments: ScheduleEvent['schedule_assignments']
  event: ScheduleEvent
  data: ScheduleData
  canEdit: boolean
  onAdd: (memberId: string) => void
  onRemove: (assignmentId: string) => void
  onSwap: (assignmentId: string, memberId: string) => void
}) {
  const common = {
    event,
    events: data.domainEvents,
    assignments: data.assignments,
    unavailability: data.unavailability,
    eligibility: data.eligibility,
  }
  const suggestions = suggestSubstitutes({ ...common, roleId, members: data.members, limit: 50 })
  const suggestedIds = new Set(suggestions.map((s) => s.member.id))
  const inEvent = new Set(event.schedule_assignments.map((a) => a.ministry_member_id))
  // Outros com a função mas com algum problema (o líder ainda pode escalar)
  const others = data.members.filter(
    (m) =>
      m.roleIds.includes(roleId) &&
      !suggestedIds.has(m.id) &&
      !inEvent.has(m.id) &&
      m.status === 'active',
  )

  return (
    <section className="bg-card flex flex-col gap-2 rounded-2xl border p-3.5">
      <h2 className="text-[15px] font-semibold">{roleName}</h2>
      {assignments.length === 0 && (
        <p className="text-muted-foreground text-[13px]">Ninguém escalado.</p>
      )}
      <ul className="flex flex-col gap-2">
        {assignments.map((a) => {
          const member = data.memberById.get(a.ministry_member_id)
          if (!member) return null
          const conflicts = assignmentConflicts({ ...common, member, roleId })
          const [sub] = conflicts.length
            ? suggestSubstitutes({
                ...common,
                roleId,
                members: data.members,
                exclude: [member.id],
                limit: 1,
              })
            : []
          return (
            <li key={a.id} className="bg-secondary flex flex-col gap-2 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium">{member.name}</span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Tirar ${member.name} de ${roleName}`}
                    onClick={() => onRemove(a.id)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              {conflicts.map((c) => (
                <p key={c.kind} className="text-warning flex items-start gap-2 text-[13px]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {c.message}
                </p>
              ))}
              {canEdit && sub && (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => onSwap(a.id, sub.member.id)}
                >
                  Trocar por {sub.member.name} ({sub.assignmentsInMonth} no mês)
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {canEdit && (
        <NativeSelect
          aria-label={`Escalar em ${roleName}`}
          value=""
          onChange={(e) => e.target.value && onAdd(e.target.value)}
        >
          <option value="">+ Escalar em {roleName}</option>
          {suggestions.length > 0 && (
            <optgroup label="Disponíveis (menos escalados primeiro)">
              {suggestions.map((s) => (
                <option key={s.member.id} value={s.member.id}>
                  {s.member.name} · {s.assignmentsInMonth} no mês
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Com restrição">
              {others.map((m) => {
                const [c] = assignmentConflicts({ ...common, member: m, roleId })
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} ·{' '}
                    {c?.kind === 'unavailable'
                      ? 'indisponível'
                      : c?.kind === 'ineligible'
                        ? 'inelegível'
                        : 'outro evento'}
                  </option>
                )
              })}
            </optgroup>
          )}
        </NativeSelect>
      )}
    </section>
  )
}
