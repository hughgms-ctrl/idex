import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LocateFixed } from 'lucide-react'
import { normalizeTiers } from '@domain/points.ts'

import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useChurch } from '@/features/church/church-context'
import { ministryKeys, useMinistrySettings } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
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
        <ChurchLocation key={churchRow.data.updated_at} church={churchRow.data} canEdit={isOwner} />
      )}
      {ministry && settings.data && (
        <MinistryRules
          key={settings.data.updated_at}
          ministryName={ministry.name}
          settings={settings.data}
          canEdit={isLeader(ministry.id)}
        />
      )}
    </>
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
