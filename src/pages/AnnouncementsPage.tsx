import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BellRing, ChevronDown, Clock, Send, X } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  announcementKeys,
  useAnnouncements,
  useAudiencePeople,
  useDeliveries,
  useUpcomingEvents,
} from '@/features/announcements/queries'
import {
  deliveryLabel,
  deliverySummary,
  reachLabel,
  type DeliveryTone,
} from '@/features/announcements/delivery'
import { fillTemplate, TEMPLATES, type TemplateId } from '@/features/announcements/templates'
import { useChurch } from '@/features/church/church-context'
import { useMinistryMembers } from '@/features/members/queries'
import { EVENT_KIND_LABEL, fromLocalInputs, toLocalInputs } from '@/features/schedule/datetime'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Audience = 'all' | 'leaders' | 'event' | 'members'
type Channel = 'push' | 'push_whatsapp'

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'event', label: 'Equipe de um evento' },
  { id: 'members', label: 'Escolher pessoas' },
  { id: 'leaders', label: 'Só líderes' },
]

const AUDIENCE_LABEL: Record<string, string> = {
  all: 'todos',
  leaders: 'líderes',
  event: 'equipe do evento',
  members: 'pessoas escolhidas',
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// Central de avisos: o líder (ou quem tem a permissão) escreve um aviso,
// escolhe para quem, por onde e quando. O envio sai pelo mesmo caminho dos
// lembretes automáticos (celular e, se escolhido, WhatsApp).
export function AnnouncementsPage() {
  const { ministry, can } = useChurch()
  if (!ministry) return <ErrorState error="Nenhum ministério selecionado." />
  if (!can(ministry.id, 'announcements')) {
    return (
      <ErrorState error="Só o líder ou quem tem a permissão da central de avisos envia avisos." />
    )
  }
  return (
    <>
      <PageHeader
        title="Avisos"
        description="Envie avisos no celular da equipe — na hora ou agendados."
      />
      <NewAnnouncement ministryId={ministry.id} churchId={ministry.church_id} />
      <AnnouncementList ministryId={ministry.id} />
    </>
  )
}

function NewAnnouncement({ ministryId, churchId }: { ministryId: string; churchId: string }) {
  const queryClient = useQueryClient()
  const events = useUpcomingEvents(ministryId)
  const members = useMinistryMembers(ministryId)

  const [template, setTemplate] = useState<TemplateId>('custom')
  const [eventId, setEventId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [channel, setChannel] = useState<Channel>('push')
  const [scheduled, setScheduled] = useState(false)
  const [date, setDate] = useState(
    () => toLocalInputs(new Date(Date.now() + 3_600_000).toISOString()).date,
  )
  const [time, setTime] = useState(
    () => toLocalInputs(new Date(Date.now() + 3_600_000).toISOString()).time,
  )

  const needsEvent = TEMPLATES.find((t) => t.id === template)?.needsEvent || audience === 'event'
  const people = useAudiencePeople(ministryId, audience, eventId, memberIds)

  const activeMembers = useMemo(
    () => (members.data ?? []).filter((m) => m.status === 'active'),
    [members.data],
  )
  const shownMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? activeMembers.filter((m) => m.name.toLowerCase().includes(q)) : activeMembers
  }, [activeMembers, search])

  function applyTemplate(id: TemplateId, evId: string) {
    const ev = (events.data ?? []).find((e) => e.id === evId) ?? null
    const filled = fillTemplate(id, ev)
    if (filled) {
      setTitle(filled.title)
      setBody(filled.body)
    }
  }

  const invalid =
    !title.trim() ||
    !body.trim() ||
    (audience === 'event' && !eventId) ||
    (audience === 'members' && memberIds.length === 0) ||
    (scheduled && (!date || !time))

  const save = useMutation({
    mutationFn: async () => {
      const sendAt = scheduled ? fromLocalInputs(date, time) : new Date()
      if (scheduled && sendAt.getTime() < Date.now() - 60_000) {
        throw new Error('Escolha um dia e hora no futuro.')
      }
      const { error } = await supabase.from('announcements').insert({
        church_id: churchId,
        ministry_id: ministryId,
        title: title.trim(),
        body: body.trim(),
        audience,
        event_id: eventId || null,
        member_ids: audience === 'members' ? memberIds : [],
        channel,
        send_at: sendAt.toISOString(),
      })
      if (error) throw error
      // "Agora": já coloca na fila (o envio sai no próximo minuto)
      if (!scheduled) await supabase.rpc('dispatch_announcements')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: announcementKeys.list(ministryId) })
      toast.success(scheduled ? 'Aviso agendado' : 'Aviso enviado — chega em até 1 minuto')
      setTitle('')
      setBody('')
      setTemplate('custom')
      setMemberIds([])
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <Panel>
      <SectionTitle title="Novo aviso" />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Modelo</legend>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <Chip
              key={t.id}
              active={template === t.id}
              onClick={() => {
                setTemplate(t.id)
                applyTemplate(t.id, eventId)
              }}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      {needsEvent && (
        <FormField id="ann-event" label="Evento">
          <NativeSelect
            id="ann-event"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value)
              applyTemplate(template, e.target.value)
            }}
          >
            <option value="">Escolha o culto ou ensaio</option>
            {(events.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {EVENT_KIND_LABEL[e.kind] ?? 'Evento'} · {e.title} · {formatEventDate(e.starts_at)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      )}

      <FormField id="ann-title" label="Título">
        <Input
          id="ann-title"
          value={title}
          maxLength={80}
          placeholder="Ex.: Ensaio extra no sábado"
          onChange={(e) => setTitle(e.target.value)}
        />
      </FormField>
      <FormField id="ann-body" label="Mensagem" hint={`${body.length}/1000`}>
        <textarea
          id="ann-body"
          rows={4}
          maxLength={1000}
          value={body}
          placeholder="Escreva o aviso para a equipe"
          className="border-input rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
          onChange={(e) => setBody(e.target.value)}
        />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Para quem</legend>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <Chip key={a.id} active={audience === a.id} onClick={() => setAudience(a.id)}>
              {a.label}
            </Chip>
          ))}
        </div>
        {audience === 'members' && (
          <div className="flex flex-col gap-2 pt-1">
            <Input
              value={search}
              placeholder="Buscar pelo nome"
              aria-label="Buscar integrante"
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {shownMembers.map((m) => (
                <Label
                  key={m.id}
                  className="hover:bg-secondary min-h-11 cursor-pointer rounded-lg px-2 font-normal"
                >
                  <Checkbox
                    checked={memberIds.includes(m.id)}
                    onCheckedChange={(v) =>
                      setMemberIds((ids) => (v ? [...ids, m.id] : ids.filter((id) => id !== m.id)))
                    }
                  />
                  {m.name}
                </Label>
              ))}
            </div>
          </div>
        )}
        {audience === 'event' && !eventId && (
          <p className="text-muted-foreground text-xs">Escolha o evento acima.</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Quando</legend>
        <div className="flex flex-wrap gap-2">
          <Chip active={!scheduled} onClick={() => setScheduled(false)}>
            Agora
          </Chip>
          <Chip active={scheduled} onClick={() => setScheduled(true)}>
            Agendar
          </Chip>
        </div>
        {scheduled && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <FormField id="ann-date" label="Dia">
              <Input
                id="ann-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </FormField>
            <FormField id="ann-time" label="Hora">
              <Input
                id="ann-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </FormField>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Por onde</legend>
        <div className="flex flex-wrap gap-2">
          <Chip active={channel === 'push'} onClick={() => setChannel('push')}>
            Só no celular
          </Chip>
          <Chip active={channel === 'push_whatsapp'} onClick={() => setChannel('push_whatsapp')}>
            Celular + WhatsApp
          </Chip>
        </div>
        <p className="text-muted-foreground text-xs">
          No celular chega para quem ativou os avisos no app (no iPhone, só com o app instalado).
        </p>
      </fieldset>

      {people.data && (audience !== 'event' || eventId) && (
        <AudiencePreview people={people.data} channel={channel} />
      )}

      <Button size="lg" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
        {scheduled ? <Clock aria-hidden="true" /> : <Send aria-hidden="true" />}
        {save.isPending ? 'Salvando…' : scheduled ? 'Agendar aviso' : 'Enviar agora'}
      </Button>
    </Panel>
  )
}

function AnnouncementList({ ministryId }: { ministryId: string }) {
  const queryClient = useQueryClient()
  const list = useAnnouncements(ministryId)

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('announcements')
        .update({ status: 'canceled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: announcementKeys.list(ministryId) })
      toast.success('Aviso cancelado')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  const rows = list.data ?? []
  const pending = rows.filter((a) => a.status === 'scheduled').reverse()
  const done = rows.filter((a) => a.status !== 'scheduled')

  return (
    <>
      {pending.length > 0 && (
        <Panel>
          <SectionTitle title="Agendados" />
          <ul className="flex flex-col gap-2">
            {pending.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-xl border p-3">
                <Clock className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{a.title}</span>
                  <span className="text-muted-foreground line-clamp-2 text-[13px]">{a.body}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatEventDate(a.send_at)} · {AUDIENCE_LABEL[a.audience]}
                    {a.channel === 'push_whatsapp' ? ' · celular + WhatsApp' : ' · celular'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Cancelar "${a.title}"`}
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (window.confirm(`Cancelar o aviso "${a.title}"?`)) cancel.mutate(a.id)
                  }}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel>
        <SectionTitle title="Enviados" />
        {done.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum aviso enviado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {done.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-xl border p-3">
                <BellRing
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    a.status === 'canceled' ? 'text-muted-foreground' : 'text-primary',
                  )}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{a.title}</span>
                    {a.status === 'canceled' && <Badge variant="outline">CANCELADO</Badge>}
                  </span>
                  <span className="text-muted-foreground line-clamp-2 text-[13px]">{a.body}</span>
                  <span className="text-muted-foreground text-xs">
                    {formatEventDate(a.sent_at ?? a.send_at)} · {AUDIENCE_LABEL[a.audience]}
                    {a.channel === 'push_whatsapp' ? ' · celular + WhatsApp' : ' · celular'}
                  </span>
                  {a.status === 'sent' && (
                    <DeliveryList announcementId={a.id} channel={a.channel} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

const TONE_CLASS: Record<DeliveryTone, string> = {
  ok: 'text-primary',
  wait: 'text-muted-foreground',
  off: 'text-muted-foreground',
  error: 'text-destructive',
}

function PersonRow({
  name,
  label,
  tone,
  detail,
}: {
  name: string
  label: string
  tone: DeliveryTone
  detail?: string
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className={cn('truncate text-sm', tone === 'off' && 'text-muted-foreground')}>
        {name}
      </span>
      <span className={cn('shrink-0 text-right text-xs', TONE_CLASS[tone])} title={detail}>
        {tone === 'ok' ? '✓ ' : ''}
        {label}
      </span>
    </li>
  )
}

// Antes de enviar: quem vai receber e por onde
function AudiencePreview({
  people,
  channel,
}: {
  people: { profile_id: string; full_name: string; has_push: boolean; has_whatsapp: boolean }[]
  channel: string
}) {
  const rows = people.map((p) => ({ ...p, reach: reachLabel(p, channel) }))
  const reachable = rows.filter((r) => r.reach.reachable).length
  return (
    <details className="group rounded-xl border p-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-sm">
          <strong>
            {reachable} de {rows.length}
          </strong>{' '}
          {rows.length === 1 ? 'pessoa vai receber' : 'pessoas vão receber'}
        </span>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          Ver quem
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <ul className="mt-1 divide-y">
        {rows
          .sort((a, b) => Number(b.reach.reachable) - Number(a.reach.reachable))
          .map((r) => (
            <PersonRow
              key={r.profile_id}
              name={r.full_name}
              label={r.reach.label}
              tone={r.reach.reachable ? 'ok' : 'off'}
            />
          ))}
      </ul>
      {reachable < rows.length && (
        <p className="text-muted-foreground mt-2 text-xs">
          Quem não ativou os avisos ativa em: foto no canto de cima → “Instalar app e avisos”.
          {channel === 'push' && ' Ou envie por “Celular + WhatsApp”.'}
        </p>
      )}
    </details>
  )
}

// Depois de enviar: a situação de cada pessoa (carrega ao abrir)
function DeliveryList({ announcementId, channel }: { announcementId: string; channel: string }) {
  const [open, setOpen] = useState(false)
  const deliveries = useDeliveries(open ? announcementId : null)
  const list = deliveries.data ?? []
  const summary = deliverySummary(list, channel)
  return (
    <details
      className="group mt-1"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="text-primary flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium">
        {deliveries.data
          ? `Receberam: ${summary.received} de ${summary.total}${summary.waiting ? ` · ${summary.waiting} enviando` : ''}`
          : 'Ver quem recebeu'}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      {deliveries.isPending ? (
        <p className="text-muted-foreground text-xs">Carregando…</p>
      ) : deliveries.error ? (
        <p className="text-destructive text-xs">{errorMessage(deliveries.error)}</p>
      ) : (
        <ul className="divide-y">
          {list
            .map((d) => ({ d, l: deliveryLabel(d, channel) }))
            .sort((a, b) => Number(b.l.tone === 'ok') - Number(a.l.tone === 'ok'))
            .map(({ d, l }) => (
              <PersonRow
                key={d.profile_id}
                name={d.full_name}
                label={l.label}
                tone={l.tone}
                detail={l.detail}
              />
            ))}
        </ul>
      )}
    </details>
  )
}
