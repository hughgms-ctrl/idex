import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarPlus } from 'lucide-react'
import { defaultRehearsal } from '@domain/schedule.ts'

import { useUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { useMinistrySettings } from '@/features/ministries/queries'
import { fromLocalInputs, toLocalInputs } from '@/features/schedule/datetime'
import { scheduleKeys } from '@/features/schedule/queries'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

/** Cultos futuros sem ensaio ligado (ou sem horário de chegada). */
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
        ? await supabase.from('events').select('service_event_id').in('service_event_id', ids)
        : { data: [], error: null }
      if (err) throw err
      const has = new Set(linked.map((r) => r.service_event_id))
      return services.map((s) => ({ ...s, hasRehearsal: has.has(s.id) }))
    },
  })
}

// Aviso para o líder: cultos sem ensaio / sem chegada → cria tudo pelas regras.
export function MissingRehearsals({ ministry }: { ministry: Tables<'ministries'> }) {
  const user = useUser()
  const queryClient = useQueryClient()
  const settings = useMinistrySettings(ministry.id).data
  const services = useServicesMissingSetup(ministry.id)
  const withoutRehearsal = (services.data ?? []).filter((s) => !s.hasRehearsal)
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
      const rows = withoutRehearsal.map((s) => {
        const { date } = toLocalInputs(s.starts_at)
        const r = defaultRehearsal(date, settings)
        const start = fromLocalInputs(r.date, r.time)
        return {
          church_id: ministry.church_id,
          ministry_id: ministry.id,
          kind: 'rehearsal' as const,
          title: `Ensaio · ${s.title}`,
          location_name: s.location_name,
          starts_at: start.toISOString(),
          ends_at: new Date(
            start.getTime() + settings.rehearsal_duration_min * 60_000,
          ).toISOString(),
          arrive_at: new Date(
            start.getTime() - settings.rehearsal_arrival_minutes * 60_000,
          ).toISOString(),
          service_event_id: s.id,
          created_by: user.id,
        }
      })
      // ensaio que cairia depois do culto (regra no mesmo dia, horário depois) fica de fora
      const valid = rows.filter(
        (r, i) => r.starts_at < (withoutRehearsal[i]?.starts_at ?? r.starts_at),
      )
      if (valid.length) {
        const { error } = await supabase.from('events').insert(valid)
        if (error) throw error
      }
      return valid.length
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
            {withoutRehearsal.length === 1 ? 'culto sem ensaio' : 'cultos sem ensaio'}
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
