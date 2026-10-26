import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarPlus } from 'lucide-react'
import { defaultRehearsal } from '@domain/schedule.ts'

import { useUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { useMinistrySettings, useRehearsalGroups } from '@/features/ministries/queries'
import { fromLocalInputs, toLocalInputs } from '@/features/schedule/datetime'
import { scheduleKeys } from '@/features/schedule/queries'
import { rehearsalSlots, rehearsalTitle } from '@/features/schedule/rehearsal-groups'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

/** Cultos futuros com os ensaios que já têm (ou sem horário de chegada). */
function useServicesMissingSetup(ministryId: string) {
  return useQuery({
    queryKey: [...scheduleKeys.all, 'missing-setup', ministryId],
    queryFn: async () => {
      const { data: services, error } = await supabase
        .from('events')
        .select('id, title, starts_at, arrive_at, soundcheck_at, location_name')
        .eq('ministry_id', ministryId)
        .eq('kind', 'service')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(200)
      if (error) throw error
      const ids = services.map((s) => s.id)
      const { data: linked, error: err } = ids.length
        ? await supabase
            .from('events')
            .select('id, service_event_id, rehearsal_group_id')
            .in('service_event_id', ids)
        : { data: [], error: null }
      if (err) throw err
      return services.map((s) => ({
        ...s,
        rehearsals: linked
          .filter((r) => r.service_event_id === s.id)
          .map((r) => ({ id: r.id, groupId: r.rehearsal_group_id })),
      }))
    },
  })
}

// Aviso para o líder: cultos sem ensaio / sem chegada → cria tudo pelas regras.
export function MissingRehearsals({ ministry }: { ministry: Tables<'ministries'> }) {
  const user = useUser()
  const queryClient = useQueryClient()
  const settings = useMinistrySettings(ministry.id).data
  const services = useServicesMissingSetup(ministry.id)
  const groups = useRehearsalGroups(ministry.id).data
  const slots = rehearsalSlots(settings, groups)
  // Cada culto precisa de um ensaio por grupo (banda, vozes…). O ensaio antigo
  // da equipe toda vira o do primeiro grupo que falta (mantém dia e horário).
  const plans = (services.data ?? [])
    .map((s) => {
      const missing = slots.filter((slot) => !s.rehearsals.some((r) => r.groupId === slot.groupId))
      const legacy =
        slots[0]?.groupId != null ? s.rehearsals.find((r) => r.groupId === null) : undefined
      return { service: s, missing, legacy }
    })
    .filter((p) => p.missing.length > 0)
  const withoutRehearsal = plans
  const withoutArrival = (services.data ?? []).filter((s) => !s.arrive_at)

  const fix = useMutation({
    mutationFn: async () => {
      if (!settings) return 0
      for (const s of withoutArrival) {
        // X minutos antes do início (conta certo mesmo perto da meia-noite)
        const start = new Date(s.starts_at).getTime()
        const before = (min: number) => new Date(start - min * 60_000).toISOString()
        const patch = {
          arrive_at: before(settings.service_arrival_minutes),
          soundcheck_at:
            s.soundcheck_at ??
            (settings.service_soundcheck_minutes != null
              ? before(settings.service_soundcheck_minutes)
              : null),
        }
        const { error } = await supabase.from('events').update(patch).eq('id', s.id)
        if (error) throw error
      }
      if (!settings.rehearsal_enabled || withoutRehearsal.length === 0) return 0
      let count = 0
      const rows = []
      for (const { service: s, missing, legacy } of withoutRehearsal) {
        const [first, ...rest] = missing
        const toCreate = legacy ? rest : missing
        if (legacy && first) {
          const { error } = await supabase
            .from('events')
            .update({
              rehearsal_group_id: first.groupId,
              title: rehearsalTitle(first.name, s.title),
            })
            .eq('id', legacy.id)
          if (error) throw error
          count++
        }
        for (const slot of toCreate) {
          const { date } = toLocalInputs(s.starts_at)
          const r = defaultRehearsal(date, slot.defaults)
          const start = fromLocalInputs(r.date, r.time)
          // ensaio que cairia depois do culto (regra no mesmo dia, horário depois) fica de fora
          if (start.toISOString() >= s.starts_at) continue
          rows.push({
            church_id: ministry.church_id,
            ministry_id: ministry.id,
            kind: 'rehearsal' as const,
            title: rehearsalTitle(slot.groupId ? slot.name : null, s.title),
            location_name: s.location_name,
            starts_at: start.toISOString(),
            ends_at: new Date(start.getTime() + slot.durationMin * 60_000).toISOString(),
            arrive_at: new Date(
              start.getTime() - settings.rehearsal_arrival_minutes * 60_000,
            ).toISOString(),
            service_event_id: s.id,
            rehearsal_group_id: slot.groupId,
            created_by: user.id,
          })
        }
      }
      if (rows.length) {
        const { error } = await supabase.from('events').insert(rows)
        if (error) throw error
      }
      return count + rows.length
    },
    onSuccess: async (n) => {
      await queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
      toast.success(
        n ? `${n} ${n === 1 ? 'ensaio criado' : 'ensaios criados'}` : 'Horários ajustados',
      )
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const needsRehearsal = settings?.rehearsal_enabled && withoutRehearsal.length > 0
  if (!settings || (!needsRehearsal && withoutArrival.length === 0)) return null

  return (
    <div className="border-info/60 bg-info/10 flex flex-col gap-2 rounded-2xl border p-3.5">
      <p className="text-sm">
        {needsRehearsal && (
          <>
            <strong>{withoutRehearsal.length}</strong>{' '}
            {slots[0]?.groupId
              ? withoutRehearsal.length === 1
                ? `culto sem ${slots.map((sl) => sl.name.toLowerCase()).join(' e ')}`
                : `cultos sem ${slots.map((sl) => sl.name.toLowerCase()).join(' e ')}`
              : withoutRehearsal.length === 1
                ? 'culto sem ensaio'
                : 'cultos sem ensaio'}
          </>
        )}
        {needsRehearsal && withoutArrival.length > 0 && ' e '}
        {withoutArrival.length > 0 && (
          <>
            <strong>{withoutArrival.length}</strong> sem horário de chegada
          </>
        )}
        . Criar pelas regras de horário das Configurações?
      </p>
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={fix.isPending}
        onClick={() => fix.mutate()}
      >
        <CalendarPlus aria-hidden="true" /> {fix.isPending ? 'Criando…' : 'Criar agora'}
      </Button>
    </div>
  )
}
