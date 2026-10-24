import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LocateFixed } from 'lucide-react'
import { addDaysToKey, addMonths, localDateKey } from '@domain/time.ts'
import { Link } from 'react-router'
import { normalizeTiers } from '@domain/points.ts'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useChurch } from '@/features/church/church-context'
import { ministryKeys, useMinistrySettings } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export function SettingsPage() {
  const { church, ministry, isOwner, isLeader } = useChurch()
  const settings = useMinistrySettings(ministry?.id)
  const churchRow = useQuery({
    queryKey: ['church', church.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('churches')
        .select('*')
        .eq('id', church.id)
        .single()
      if (error) throw error
      return data
    },
  })

  return (
    <>
      <PageHeader title="Configurações" description={church.name} />
      {churchRow.data && (
        <ChurchLocation
          key={`igreja-${churchRow.data.updated_at}`}
          church={churchRow.data}
          canEdit={isOwner}
        />
      )}
      {ministry && settings.data && (
        <ServiceTimes
          key={`horarios-${settings.data.updated_at}`}
          settings={settings.data}
          canEdit={isLeader(ministry.id)}
        />
      )}
      {ministry && settings.data && (
        <AvailabilityPeriod
          key={`periodo-${settings.data.updated_at}`}
          settings={settings.data}
          canEdit={isLeader(ministry.id)}
        />
      )}
      {ministry && settings.data && (
        <CheckinMode
          key={`ponto-${settings.data.updated_at}`}
          settings={settings.data}
          canEdit={isLeader(ministry.id)}
        />
      )}
      {ministry && settings.data && (
        <MinistryRules
          key={`regras-${settings.data.updated_at}`}
          ministryName={ministry.name}
          settings={settings.data}
          canEdit={isLeader(ministry.id)}
        />
      )}
      {isOwner && <NotificationLog churchId={church.id} />}
    </>
  )
}

function useSaveSettings(ministryId: string, message: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<Tables<'ministry_settings'>>) => {
      const { error } = await supabase
        .from('ministry_settings')
        .update(patch)
        .eq('ministry_id', ministryId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ministryKeys.settings(ministryId) })
      toast.success(message)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
}

// Padrões de horário: chegada da equipe e ensaio de cada culto.
function ServiceTimes({
  settings,
  canEdit,
}: {
  settings: Tables<'ministry_settings'>
  canEdit: boolean
}) {
  const save = useSaveSettings(settings.ministry_id, 'Horários salvos')
  const [arrival, setArrival] = useState(String(settings.service_arrival_minutes))
  const [enabled, setEnabled] = useState(settings.rehearsal_enabled)
  const [daysBefore, setDaysBefore] = useState(String(settings.rehearsal_days_before))
  const [time, setTime] = useState(settings.rehearsal_time.slice(0, 5))
  const [duration, setDuration] = useState(String(settings.rehearsal_duration_min))

  const submit = () => {
    const a = Number(arrival)
    const d = Number(duration)
    if (!Number.isInteger(a) || a < 0 || a > 360)
      return toast.error('Chegada: de 0 a 360 minutos antes')
    if (!/^\d{2}:\d{2}$/.test(time)) return toast.error('Informe o horário do ensaio')
    if (!Number.isInteger(d) || d < 15 || d > 600)
      return toast.error('Duração do ensaio: de 15 a 600 minutos')
    save.mutate({
      service_arrival_minutes: a,
      rehearsal_enabled: enabled,
      rehearsal_days_before: Number(daysBefore),
      rehearsal_time: time,
      rehearsal_duration_min: d,
    })
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Cultos e ensaios" />
      <Panel className="gap-4">
        <p className="text-muted-foreground text-[13px]">
          Valem como sugestão ao criar cultos (cada culto pode ter os seus). Atraso, abertura do
          ponto e “esqueci de registrar” contam a partir do horário de chegada.
        </p>
        <FormField id="st-arrival" label="Equipe chega quantos minutos antes do culto?">
          <Input
            id="st-arrival"
            type="number"
            min={0}
            max={360}
            inputMode="numeric"
            value={arrival}
            disabled={!canEdit}
            onChange={(e) => setArrival(e.target.value)}
          />
        </FormField>
        <Label className="min-h-11 cursor-pointer font-normal">
          <Checkbox
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={(v) => setEnabled(v === true)}
          />
          Todo culto tem ensaio
        </Label>
        {enabled && (
          <div className="grid grid-cols-2 gap-3">
            <FormField id="st-days" label="Ensaio">
              <NativeSelect
                id="st-days"
                value={daysBefore}
                disabled={!canEdit}
                onChange={(e) => setDaysBefore(e.target.value)}
              >
                <option value="0">No mesmo dia</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'dia antes' : 'dias antes'}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="st-time" label="Horário do ensaio">
              <Input
                id="st-time"
                type="time"
                value={time}
                disabled={!canEdit}
                onChange={(e) => setTime(e.target.value)}
              />
            </FormField>
            <FormField id="st-duration" label="Duração (min)">
              <Input
                id="st-duration"
                type="number"
                min={15}
                max={600}
                inputMode="numeric"
                value={duration}
                disabled={!canEdit}
                onChange={(e) => setDuration(e.target.value)}
              />
            </FormField>
          </div>
        )}
        {canEdit && (
          <Button className="self-start" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar horários'}
          </Button>
        )}
      </Panel>
    </section>
  )
}

// Período da programação que a equipe responde ("posso / não posso").
function AvailabilityPeriod({
  settings,
  canEdit,
}: {
  settings: Tables<'ministry_settings'>
  canEdit: boolean
}) {
  const today = localDateKey(new Date())
  const [startsOn, setStartsOn] = useState(settings.availability_starts_on ?? '')
  const [endsOn, setEndsOn] = useState(settings.availability_ends_on ?? '')
  const [deadline, setDeadline] = useState(settings.availability_deadline ?? '')
  const save = useSaveSettings(settings.ministry_id, 'Período salvo')
  const open = settings.availability_starts_on && settings.availability_ends_on

  // de hoje até o mesmo dia daqui a N meses (menos um dia)
  const quick = (months: number) => {
    const [y, m, d] = today.split('-').map(Number) as [number, number, number]
    const target = addMonths(y, m, months)
    const lastDay = new Date(Date.UTC(target.year, target.month, 0)).getUTCDate()
    const end = `${target.year}-${String(target.month).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`
    setStartsOn(today)
    setEndsOn(addDaysToKey(end, -1))
  }

  const submit = () => {
    if (!startsOn || !endsOn) return toast.error('Escolha o início e o fim do período')
    if (endsOn < startsOn) return toast.error('O fim precisa ser depois do início')
    save.mutate({
      availability_starts_on: startsOn,
      availability_ends_on: endsOn,
      availability_deadline: deadline || null,
    })
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Disponibilidade da equipe" />
      <Panel className="gap-4">
        <p className="text-muted-foreground text-[13px]">
          Escolha o período da programação. A equipe vê os cultos e ensaios desse período e marca
          “Posso” ou “Não posso”. Quem não responder pode ser escalado normalmente. Os cultos são
          criados em{' '}
          <Link to="/escalas" className="text-primary underline">
            Escala
          </Link>{' '}
          (dá para repetir toda semana).
        </p>
        {open && (
          <p className="text-sm">
            Aberto: <strong>{formatDate(settings.availability_starts_on!)}</strong> a{' '}
            <strong>{formatDate(settings.availability_ends_on!)}</strong>
            {settings.availability_deadline &&
              ` · respostas até ${formatDate(settings.availability_deadline)}`}
          </p>
        )}
        {canEdit && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => quick(1)}>
                Próximo mês
              </Button>
              <Button variant="outline" size="sm" onClick={() => quick(3)}>
                Próximos 3 meses
              </Button>
              <Button variant="outline" size="sm" onClick={() => quick(6)}>
                Próximos 6 meses
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="av-start" label="De">
                <Input
                  id="av-start"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </FormField>
              <FormField id="av-end" label="Até">
                <Input
                  id="av-end"
                  type="date"
                  value={endsOn}
                  min={startsOn || undefined}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </FormField>
            </div>
            <FormField id="av-deadline" label="Responder até (opcional)">
              <Input
                id="av-deadline"
                type="date"
                value={deadline}
                min={today}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button onClick={submit} disabled={save.isPending}>
                {save.isPending ? 'Salvando…' : open ? 'Salvar período' : 'Abrir para a equipe'}
              </Button>
              {open && (
                <Button
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      availability_starts_on: null,
                      availability_ends_on: null,
                      availability_deadline: null,
                    })
                  }
                >
                  Fechar período
                </Button>
              )}
            </div>
          </>
        )}
      </Panel>
    </section>
  )
}

const CHECKIN_MODES = [
  {
    value: 'qr',
    title: 'Só QR Code',
    text: 'A pessoa lê o QR que você projeta. Não pede localização.',
  },
  {
    value: 'qr_geo',
    title: 'QR Code + localização',
    text: 'Lê o QR e precisa estar perto da igreja. O mais seguro.',
  },
  {
    value: 'geo',
    title: 'Só localização',
    text: 'A pessoa abre o app e bate o ponto perto da igreja, sem QR.',
  },
] as const

function CheckinMode({
  settings,
  canEdit,
}: {
  settings: Tables<'ministry_settings'>
  canEdit: boolean
}) {
  const save = useSaveSettings(settings.ministry_id, 'Forma do ponto salva')
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Como bater o ponto" />
      <div role="radiogroup" aria-label="Como bater o ponto" className="flex flex-col gap-2">
        {CHECKIN_MODES.map((m) => {
          const on = settings.checkin_mode === m.value
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!canEdit || save.isPending}
              onClick={() => !on && save.mutate({ checkin_mode: m.value })}
              className={cn(
                'bg-card flex min-h-14 items-start gap-3 rounded-2xl border p-3.5 text-left',
                on && 'border-primary',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 size-5 shrink-0 rounded-full border-2',
                  on ? 'border-primary bg-primary' : 'border-muted-foreground',
                )}
                aria-hidden="true"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{m.title}</span>
                <span className="text-muted-foreground text-[13px]">{m.text}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ChurchLocation({ church, canEdit }: { church: Tables<'churches'>; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [address, setAddress] = useState(church.address ?? '')
  const [lat, setLat] = useState(church.lat?.toString() ?? '')
  const [lng, setLng] = useState(church.lng?.toString() ?? '')
  const [radius, setRadius] = useState(String(church.checkin_radius_m))
  const [locating, setLocating] = useState(false)

  const save = useMutation({
    mutationFn: async () => {
      const latN = lat.trim() ? Number(lat.replace(',', '.')) : null
      const lngN = lng.trim() ? Number(lng.replace(',', '.')) : null
      if (
        (latN !== null && (Number.isNaN(latN) || Math.abs(latN) > 90)) ||
        (lngN !== null && (Number.isNaN(lngN) || Math.abs(lngN) > 180))
      ) {
        throw new Error('Coordenadas inválidas')
      }
      const { error } = await supabase
        .from('churches')
        .update({
          address: address.trim() || null,
          lat: latN,
          lng: lngN,
          checkin_radius_m: Number(radius) || 300,
        })
        .eq('id', church.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['church', church.id] })
      toast.success('Localização salva')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const useCurrent = () => {
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6))
        setLng(p.coords.longitude.toFixed(6))
        setLocating(false)
        toast.success(`Localização capturada (±${Math.round(p.coords.accuracy)} m)`)
      },
      () => {
        setLocating(false)
        toast.error('Não foi possível pegar a localização. Libere a permissão no navegador.')
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Local do check-in" />
      <Panel className="gap-4">
        <p className="text-muted-foreground text-[13px]">
          O check-in só é aceito perto deste ponto. Dica: abra esta tela dentro da igreja e toque em
          “Usar minha localização”.
        </p>
        <FormField id="church-address" label="Endereço">
          <Input
            id="church-address"
            value={address}
            disabled={!canEdit}
            onChange={(e) => setAddress(e.target.value)}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="church-lat" label="Latitude">
            <Input
              id="church-lat"
              inputMode="decimal"
              value={lat}
              disabled={!canEdit}
              onChange={(e) => setLat(e.target.value)}
            />
          </FormField>
          <FormField id="church-lng" label="Longitude">
            <Input
              id="church-lng"
              inputMode="decimal"
              value={lng}
              disabled={!canEdit}
              onChange={(e) => setLng(e.target.value)}
            />
          </FormField>
        </div>
        <FormField id="church-radius" label="Raio aceito (metros)">
          <Input
            id="church-radius"
            type="number"
            min={10}
            max={5000}
            value={radius}
            disabled={!canEdit}
            onChange={(e) => setRadius(e.target.value)}
          />
        </FormField>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={useCurrent} disabled={locating}>
              <LocateFixed aria-hidden="true" />{' '}
              {locating ? 'Localizando…' : 'Usar minha localização'}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar local'}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Só o responsável pela igreja altera o local.
          </p>
        )}
      </Panel>
    </section>
  )
}

function MinistryRules({
  ministryName,
  settings,
  canEdit,
}: {
  ministryName: string
  settings: Tables<'ministry_settings'>
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const tiers = normalizeTiers(settings.late_penalty_tiers)
  const [v, setV] = useState({
    cycleMonths: String(settings.cycle_months),
    starting: String(settings.cycle_starting_points),
    min: String(settings.cycle_min_points),
    tolerance: String(settings.late_tolerance_min),
    tier1Up: String(tiers[0]?.upToMin ?? 20),
    tier1Points: String(tiers[0]?.points ?? 5),
    tier2Points: String(tiers[tiers.length - 1]?.points ?? 10),
    absence: String(settings.absence_penalty),
    requestLimit: String(settings.checkin_request_limit_per_cycle),
    deadline: String(settings.checkin_request_deadline_hours),
  })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: e.target.value })

  const save = useMutation({
    mutationFn: async () => {
      const n = Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, Math.round(Number(x))]),
      ) as Record<keyof typeof v, number>
      if (Object.values(n).some((x) => Number.isNaN(x) || x < 0))
        throw new Error('Use só números positivos')
      if (n.min > n.starting) throw new Error('O mínimo não pode ser maior que os pontos iniciais')
      if (n.tier1Up <= n.tolerance)
        throw new Error('A primeira faixa precisa ser maior que a tolerância')
      const { error } = await supabase
        .from('ministry_settings')
        .update({
          cycle_months: n.cycleMonths,
          cycle_starting_points: n.starting,
          cycle_min_points: n.min,
          late_tolerance_min: n.tolerance,
          late_penalty_tiers: [
            { upToMin: n.tier1Up, points: n.tier1Points },
            { upToMin: null, points: n.tier2Points },
          ],
          absence_penalty: n.absence,
          checkin_request_limit_per_cycle: n.requestLimit,
          checkin_request_deadline_hours: n.deadline,
        })
        .eq('ministry_id', settings.ministry_id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ministryKeys.settings(settings.ministry_id) })
      toast.success('Regras salvas')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const field = (id: keyof typeof v, label: string) => (
    <FormField id={`rule-${id}`} label={label}>
      <Input
        id={`rule-${id}`}
        type="number"
        min={0}
        inputMode="numeric"
        value={v[id]}
        disabled={!canEdit}
        onChange={set(id)}
      />
    </FormField>
  )

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title={`Pontos e presença · ${ministryName}`} />
      <Panel className="gap-4">
        <div className="grid grid-cols-3 gap-3">
          {field('cycleMonths', 'Ciclo (meses)')}
          {field('starting', 'Pontos iniciais')}
          {field('min', 'Mínimo')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field('tolerance', 'Tolerância (min)')}
          {field('absence', 'Falta sem aviso (−)')}
        </div>
        <fieldset className="grid grid-cols-3 gap-3">
          <legend className="mb-2 text-sm font-medium">Desconto por atraso</legend>
          {field('tier1Up', 'Até (min)')}
          {field('tier1Points', 'Desconto (−)')}
          {field('tier2Points', 'Acima (−)')}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          {field('requestLimit', '“Esqueci” por ciclo')}
          {field('deadline', 'Prazo do pedido (h)')}
        </div>
        {canEdit ? (
          <Button className="self-start" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar regras'}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            Só o líder do ministério altera as regras.
          </p>
        )}
      </Panel>
    </section>
  )
}

const KIND_LABEL: Record<string, string> = {
  schedule_reminder: 'Lembrete de escala',
  rehearsal_today: 'Ensaio hoje',
  points_deducted: 'Ponto descontado',
  request_reviewed: 'Pedido analisado',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'na fila',
  sending: 'enviando',
  sent: 'enviado',
  failed: 'falhou',
  skipped: 'não enviado',
}

function NotificationLog({ churchId }: { churchId: string }) {
  const log = useQuery({
    queryKey: ['notifications', churchId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_queue')
        .select('id, kind, status, last_error, created_at, sent_at, profiles(full_name)')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data
    },
  })
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Avisos por WhatsApp" />
      <p className="text-muted-foreground text-[13px]">
        Lembrete da escala 2 dias antes, ensaio no dia, ponto descontado e pedidos analisados. Cada
        pessoa pode desligar em “Meu perfil”.
      </p>
      {log.data && log.data.length > 0 ? (
        <ul className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          {log.data.map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-3 border-b px-3.5 py-2.5 text-sm last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  {KIND_LABEL[n.kind] ?? n.kind} · {n.profiles?.full_name ?? '—'}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {new Date(n.sent_at ?? n.created_at).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                  {n.last_error ? ` · ${n.last_error}` : ''}
                </span>
              </span>
              <span
                className={
                  n.status === 'sent'
                    ? 'text-primary text-xs font-semibold'
                    : n.status === 'failed'
                      ? 'text-destructive text-xs font-semibold'
                      : 'text-muted-foreground text-xs'
                }
              >
                {STATUS_LABEL[n.status] ?? n.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Panel className="text-muted-foreground items-center py-6 text-center text-sm">
          Nenhum aviso ainda.
        </Panel>
      )}
    </section>
  )
}
