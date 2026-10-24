import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  ListMusic,
  Plus,
  Pencil,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { assignmentConflicts, suggestSubstitutes } from '@domain/schedule.ts'
import { localParts } from '@domain/time.ts'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useChurch } from '@/features/church/church-context'
import { EVENT_KIND_LABEL, eventTimeRows } from '@/features/schedule/datetime'
import { useMinistrySettings } from '@/features/ministries/queries'
import { EventDialog } from '@/features/schedule/EventDialog'
import { MemberPicker } from '@/features/schedule/MemberPicker'
import {
  scheduleKeys,
  useEvent,
  useLinkedRehearsal,
  type ScheduleEvent,
} from '@/features/schedule/queries'
import { useScheduleData, type ScheduleData } from '@/features/schedule/useScheduleData'
import {
  REHEARSAL_STATUS_LABEL,
  useMyRehearsalAvailability,
  useServiceRehearsalAvailability,
  useSetAvailability,
} from '@/features/availability/queries'
import { RehearsalAvailabilityField } from '@/features/availability/RehearsalAvailability'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

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
  const [params] = useSearchParams()
  const [editOpen, setEditOpen] = useState(() => params.get('remarcar') === '1')
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
        // quem entra no lugar começa normal (não herda o "ficou de fora")
        .update({ ministry_member_id: memberId, status: 'scheduled', benched_reason: null })
        .eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Substituto escalado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const release = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('schedule_assignments')
        .update({ status: 'scheduled', benched_reason: null })
        .eq('id', assignmentId)
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Liberado para participar')
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

      <EventTimes event={event} ministryId={event.ministry_id} />
      {canEdit && event.service_event_id && (
        <Button variant="outline" className="self-start" onClick={() => setEditOpen(true)}>
          <CalendarClock aria-hidden="true" /> Remarcar ensaio
        </Button>
      )}
      <LinkedEvent event={event} />
      <MyAnswer event={event} data={data} />
      {canEdit && (event.kind === 'service' || event.service_event_id) && (
        <RehearsalAnswers
          serviceId={event.service_event_id ?? event.id}
          memberIds={event.schedule_assignments.map((a) => a.ministry_member_id)}
          data={data}
        />
      )}

      {event.kind === 'service' && (
        <Button asChild variant="outline" className="self-start">
          <Link to={`/repertorio/culto/${event.id}`}>
            <ListMusic aria-hidden="true" /> Setlist do culto
          </Link>
        </Button>
      )}

      {canEdit && <AnswersSummary event={event} data={data} />}

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
            onRelease={(id) => release.mutate(id)}
          />
        )
      })}
      {event.schedule_assignments.some((a) => a.ministry_role_id === null) && (
        <RoleSlot
          roleId={null}
          roleName="Equipe (sem função)"
          assignments={event.schedule_assignments.filter((a) => a.ministry_role_id === null)}
          event={event}
          data={data}
          canEdit={canEdit}
          onAdd={(memberId) => add.mutate({ memberId, roleId: null })}
          onRemove={(id) => remove.mutate(id)}
          onSwap={(assignmentId, memberId) => swap.mutate({ assignmentId, memberId })}
          onRelease={(id) => release.mutate(id)}
        />
      )}

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
  onRelease,
}: {
  roleId: string | null
  roleName: string
  assignments: ScheduleEvent['schedule_assignments']
  event: ScheduleEvent
  data: ScheduleData
  canEdit: boolean
  onAdd: (memberId: string) => void
  onRemove: (assignmentId: string) => void
  onSwap: (assignmentId: string, memberId: string) => void
  onRelease: (assignmentId: string) => void
}) {
  const common = {
    event,
    events: data.domainEvents,
    assignments: data.assignments,
    unavailability: data.unavailability,
    eligibility: data.eligibility,
    answers: data.answers,
  }
  const suggestions = suggestSubstitutes({ ...common, roleId, members: data.members, limit: 50 })
  const suggestedIds = new Set(suggestions.map((s) => s.member.id))
  const inEvent = new Set(event.schedule_assignments.map((a) => a.ministry_member_id))
  const [picking, setPicking] = useState(false)
  // Outros com a função mas com algum problema (o líder ainda pode escalar)
  const others = data.members.filter(
    (m) =>
      (roleId === null || m.roleIds.includes(roleId)) &&
      !suggestedIds.has(m.id) &&
      !inEvent.has(m.id) &&
      m.status === 'active',
  )
  // Equipe sem esta função (o líder pode escalar mesmo assim)
  const outsiders =
    roleId === null
      ? []
      : data.members.filter(
          (m) => m.status === 'active' && !m.roleIds.includes(roleId) && !inEvent.has(m.id),
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
          const benched = a.status === 'benched'
          const [sub] =
            conflicts.length || benched
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
                <span
                  className={cn(
                    'flex-1 text-sm font-medium',
                    benched && 'text-muted-foreground line-through',
                  )}
                >
                  {member.name}
                </span>
                {a.status === 'confirmed' && (
                  <span className="text-primary flex items-center gap-1 text-xs font-semibold">
                    <Check className="size-3.5" aria-hidden="true" /> confirmou
                  </span>
                )}
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
              {benched && (
                <p className="text-destructive flex items-start gap-2 text-[13px]">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Ficou de fora: {a.benched_reason ?? 'regra de horário'}.
                </p>
              )}
              {benched && canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => onRelease(a.id)}
                >
                  Liberar mesmo assim
                </Button>
              )}
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
      {canEdit && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={`Sugestões para ${roleName}`}>
          {suggestions.slice(0, 3).map((sg) => (
            <button
              key={sg.member.id}
              type="button"
              onClick={() => onAdd(sg.member.id)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
                sg.confirmed ? 'border-primary/60 text-primary' : 'text-foreground',
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
              {sg.member.name.split(' ')[0]}
              <span className="text-muted-foreground text-xs">
                {sg.confirmed ? 'pode' : 'sem resp.'}
              </span>
            </button>
          ))}
        </div>
      )}
      {canEdit && (
        <Button
          variant="outline"
          className="min-h-12 justify-between rounded-xl"
          onClick={() => setPicking(true)}
        >
          <span className="flex items-center gap-2">
            <UserPlus aria-hidden="true" /> Escalar em {roleName}
          </span>
          <span className="text-muted-foreground text-xs">
            {suggestions.length} disponíve{suggestions.length === 1 ? 'l' : 'is'} ›
          </span>
        </Button>
      )}
      {canEdit && (
        <MemberPicker
          open={picking}
          onOpenChange={setPicking}
          roleName={roleName}
          eventLabel={`${event.title} · ${formatEventDate(event.starts_at)}`}
          onPick={onAdd}
          groups={[
            {
              title: 'Disponíveis',
              hint: 'quem disse “posso” primeiro',
              items: suggestions.map((sg) => ({
                id: sg.member.id,
                name: sg.member.name,
                tone: sg.confirmed ? 'yes' : 'neutral',
                badge: sg.confirmed ? 'pode' : 'sem resposta',
                detail: `${sg.assignmentsInMonth} no mês`,
              })),
            },
            {
              title: 'Com restrição',
              hint: 'dá para escalar mesmo assim',
              items: others.map((m) => {
                const [c] = assignmentConflicts({ ...common, member: m, roleId })
                return {
                  id: m.id,
                  name: m.name,
                  tone: c?.kind === 'unavailable' ? 'no' : 'warn',
                  badge:
                    c?.kind === 'unavailable'
                      ? 'não pode'
                      : c?.kind === 'ineligible'
                        ? 'abaixo dos pontos'
                        : c
                          ? 'em outro evento'
                          : 'restrição',
                  detail: c?.message,
                }
              }),
            },
            {
              title: 'Outros da equipe',
              hint: 'sem esta função cadastrada',
              items: outsiders.map((m) => ({
                id: m.id,
                name: m.name,
                tone: 'neutral',
                badge: 'outra função',
              })),
            },
          ]}
        />
      )}
    </section>
  )
}

/** "Eu neste culto": o líder (ou qualquer integrante) marca se pode servir. */
function MyAnswer({ event, data }: { event: ScheduleEvent; data: ScheduleData }) {
  const { church, memberships } = useChurch()
  const me = memberships.find((m) => m.ministry_id === event.ministry_id && m.status === 'active')
  const serviceId = event.service_event_id ?? (event.kind === 'service' ? event.id : null)
  const setAnswer = useSetAvailability(me?.id, church.id)
  const rehearsalAnswers = useMyRehearsalAvailability(me?.id)
  const [now] = useState(() => Date.now())
  if (!me || !serviceId || new Date(event.starts_at).getTime() < now) return null
  const answer = data.answers.find(
    (a) => a.event_id === serviceId && a.ministry_member_id === me.id,
  )?.available
  const set = (value: boolean) =>
    setAnswer.mutate(
      { eventId: serviceId, available: answer === value ? null : value },
      {
        onSuccess: () => toast.success(answer === value ? 'Resposta apagada' : 'Resposta salva'),
        onError: (err) => toast.error(errorMessage(err)),
      },
    )
  return (
    <Panel className="gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">Você neste culto</h2>
        <p className="text-muted-foreground text-[13px]">
          Sua disponibilidade como integrante (vale também para o ensaio).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={answer === true}
          disabled={setAnswer.isPending}
          onClick={() => set(true)}
          className={cn(
            'flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold',
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
          disabled={setAnswer.isPending}
          onClick={() => set(false)}
          className={cn(
            'flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold',
            answer === false
              ? 'border-destructive bg-destructive text-white'
              : 'text-muted-foreground',
          )}
        >
          <X className="size-4" aria-hidden="true" /> Não posso
        </button>
      </div>
      {answer !== false && (
        <RehearsalAvailabilityField
          key={rehearsalAnswers.data?.[serviceId]?.note ?? ''}
          serviceId={serviceId}
          answer={rehearsalAnswers.data?.[serviceId]}
          memberId={me.id}
          churchId={church.id}
        />
      )}
    </Panel>
  )
}

// Quem respondeu "posso / não posso" para esta data
function AnswersSummary({ event, data }: { event: ScheduleEvent; data: ScheduleData }) {
  const active = data.members.filter((m) => m.status === 'active')
  const byMember = new Map(
    data.answers.filter((a) => a.event_id === event.id).map((a) => [a.ministry_member_id, a]),
  )
  const yes = active.filter((m) => byMember.get(m.id)?.available === true)
  const no = active.filter((m) => byMember.get(m.id)?.available === false)
  const none = active.length - yes.length - no.length
  const names = (list: typeof active) => list.map((m) => m.name.split(' ')[0]).join(', ')
  return (
    <Panel className="gap-1.5">
      <SectionTitle title="Disponibilidade da equipe" />
      <p className="text-sm">
        <span className="text-primary font-semibold">{yes.length} podem</span>
        {yes.length > 0 && <span className="text-muted-foreground"> · {names(yes)}</span>}
      </p>
      <p className="text-sm">
        <span className="text-destructive font-semibold">{no.length} não podem</span>
        {no.length > 0 && <span className="text-muted-foreground"> · {names(no)}</span>}
      </p>
      <p className="text-muted-foreground text-sm">{none} sem resposta (podem ser escalados)</p>
    </Panel>
  )
}

// Culto ↔ ensaio dele
/** O que a equipe disse sobre os dias de ensaio deste culto (só o líder vê). */
function RehearsalAnswers({
  serviceId,
  memberIds,
  data,
}: {
  serviceId: string
  memberIds: string[]
  data: ScheduleData
}) {
  const answers = useServiceRehearsalAvailability(serviceId).data ?? []
  const team = new Set(memberIds)
  const shown = answers.filter((a) => team.has(a.ministry_member_id) || a.status !== 'any')
  const missing = [...team].filter((id) => !answers.some((a) => a.ministry_member_id === id))
  if (shown.length === 0 && missing.length === 0) return null
  const order = { none: 0, some: 1, any: 2 }
  return (
    <section className="bg-card flex flex-col gap-2 rounded-2xl border p-3.5">
      <h2 className="text-info text-sm font-semibold">Dias para ensaiar</h2>
      <ul className="flex flex-col gap-1.5">
        {[...shown]
          .sort((a, b) => order[a.status] - order[b.status])
          .map((a) => (
            <li key={a.ministry_member_id} className="text-sm">
              <span className="font-medium">
                {data.memberById.get(a.ministry_member_id)?.name ?? 'Integrante'}
              </span>
              {': '}
              <span
                className={cn(
                  a.status === 'none' && 'text-destructive font-semibold',
                  a.status === 'some' && 'text-warning font-semibold',
                )}
              >
                {REHEARSAL_STATUS_LABEL[a.status].toLowerCase()}
              </span>
              {a.note && <span className="text-muted-foreground"> — {a.note}</span>}
            </li>
          ))}
      </ul>
      {missing.length > 0 && (
        <p className="text-muted-foreground text-[13px]">
          Sem resposta:{' '}
          {missing.map((id) => data.memberById.get(id)?.name ?? 'Integrante').join(', ')}
        </p>
      )}
    </section>
  )
}

function LinkedEvent({ event }: { event: ScheduleEvent }) {
  const rehearsal = useLinkedRehearsal(event.kind === 'service' ? event.id : undefined).data
  const service = useEvent(event.service_event_id ?? undefined).data
  if (event.kind === 'service' && rehearsal) {
    return (
      <Link
        to={`/escalas/${rehearsal.id}`}
        className="border-info/60 bg-info/10 text-info flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-sm"
      >
        <span>
          <strong>Ensaio:</strong> {formatEventDate(rehearsal.starts_at)}
        </span>
        <span className="text-xs underline">ver / remarcar ›</span>
      </Link>
    )
  }
  if (service) {
    return (
      <div className="flex flex-col gap-1.5">
        <Link
          to={`/escalas/${service.id}`}
          className="border-primary/60 bg-primary/10 text-primary flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-sm"
        >
          <span>
            <strong>Ensaio do culto:</strong> {formatEventDate(service.starts_at)}
          </span>
          <span aria-hidden="true">›</span>
        </Link>
        <p className="text-muted-foreground text-[13px]">
          Quem é escalado no culto entra neste ensaio automaticamente.
        </p>
      </div>
    )
  }
  return null
}

function EventTimes({ event, ministryId }: { event: ScheduleEvent; ministryId: string }) {
  const settings = useMinistrySettings(ministryId).data
  const rows = eventTimeRows(event, settings)
  if (rows.length <= 1) return null
  return (
    <dl
      className={cn(
        'bg-card grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl border border-l-4 p-3.5 text-sm',
        event.kind === 'rehearsal' ? 'border-l-info' : 'border-l-primary',
      )}
    >
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className={cn('text-right font-mono', r.strong && 'font-semibold')}>{r.time}</dd>
        </div>
      ))}
    </dl>
  )
}
