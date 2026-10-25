import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cycleEnd, cycleProblem, nextCycle, wholeMonths } from '@domain/cycles.ts'
import { localDateKey } from '@domain/time.ts'

import { FormField } from '@/components/FormField'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ministryKeys, useOpenCycle } from '@/features/ministries/queries'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'

const PRESETS = [3, 6]

function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// Ciclo de pontos: o líder escolhe de quando até quando vale o ciclo atual e o
// tamanho dos próximos (cada um começa no dia seguinte ao fim do anterior).
export function CycleSettings({
  settings,
  canEdit,
}: {
  settings: Tables<'ministry_settings'>
  canEdit: boolean
}) {
  const cycle = useOpenCycle(settings.ministry_id)
  const previous = useQuery({
    queryKey: ['previous-cycle-end', settings.ministry_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cycles')
        .select('ends_on')
        .eq('ministry_id', settings.ministry_id)
        .neq('status', 'open')
        .order('ends_on', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data?.ends_on ?? null
    },
  })

  if (!cycle.data) return null
  return (
    <CycleForm
      key={`${cycle.data.id}-${cycle.data.starts_on}-${cycle.data.ends_on}-${settings.cycle_months}`}
      cycle={cycle.data}
      nextMonths={settings.cycle_months}
      previousEnd={previous.data ?? null}
      canEdit={canEdit}
    />
  )
}

function CycleForm({
  cycle,
  nextMonths: initialNext,
  previousEnd,
  canEdit,
}: {
  cycle: Tables<'cycles'>
  nextMonths: number
  previousEnd: string | null
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [startsOn, setStartsOn] = useState(cycle.starts_on)
  const [endsOn, setEndsOn] = useState(cycle.ends_on)
  const [nextMonths, setNextMonths] = useState(initialNext)
  const [customNext, setCustomNext] = useState(!PRESETS.includes(initialNext))

  const months = startsOn && endsOn ? wholeMonths(startsOn, endsOn) : null
  const today = localDateKey(new Date())
  const problem = cycleProblem({ startsOn, endsOn, today, previousEnd })
  const next = !problem ? nextCycle(endsOn, nextMonths) : null
  const changed =
    startsOn !== cycle.starts_on || endsOn !== cycle.ends_on || nextMonths !== initialNext

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_current_cycle', {
        p_ministry_id: cycle.ministry_id,
        p_starts_on: startsOn,
        p_ends_on: endsOn,
        p_next_months: nextMonths,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ministryKeys.openCycle(cycle.ministry_id) }),
        queryClient.invalidateQueries({ queryKey: ministryKeys.settings(cycle.ministry_id) }),
      ])
      toast.success('Ciclo salvo')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Ciclo de pontos" />
      <Panel className="gap-4">
        <p className="text-muted-foreground text-sm">
          Cada pessoa começa o ciclo com o saldo cheio; no fim, quem ficou acima do mínimo pode ser
          escalada no ciclo seguinte.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <FormField id="cycle-start" label="Ciclo atual: de">
            <Input
              id="cycle-start"
              type="date"
              value={startsOn}
              disabled={!canEdit}
              onChange={(e) => {
                const v = e.target.value
                // mantém a duração em meses ao mudar o início
                if (v && months) setEndsOn(cycleEnd(v, months))
                setStartsOn(v)
              }}
            />
          </FormField>
          <FormField id="cycle-end" label="até">
            <Input
              id="cycle-end"
              type="date"
              value={endsOn}
              min={startsOn}
              disabled={!canEdit}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Duração do ciclo atual</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((m) => (
              <Chip
                key={m}
                active={months === m}
                disabled={!canEdit || !startsOn}
                onClick={() => setEndsOn(cycleEnd(startsOn, m))}
              >
                {m} meses
              </Chip>
            ))}
            <Chip active={months === null || !PRESETS.includes(months)} disabled onClick={() => {}}>
              {months && !PRESETS.includes(months) ? `${months} meses` : 'Data específica'}
            </Chip>
          </div>
          <p className="text-muted-foreground text-xs">
            Os atalhos contam a partir do dia de início. Para outra data, escolha em “até”.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Próximos ciclos</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((m) => (
              <Chip
                key={m}
                active={!customNext && nextMonths === m}
                disabled={!canEdit}
                onClick={() => {
                  setCustomNext(false)
                  setNextMonths(m)
                }}
              >
                {m} meses
              </Chip>
            ))}
            <Chip active={customNext} disabled={!canEdit} onClick={() => setCustomNext(true)}>
              Outro
            </Chip>
            {customNext && (
              <span className="flex items-center gap-2 text-sm">
                <Input
                  aria-label="Meses dos próximos ciclos"
                  type="number"
                  min={1}
                  max={12}
                  inputMode="numeric"
                  className="w-20"
                  value={nextMonths}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setNextMonths(
                      Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1))),
                    )
                  }
                />
                meses
              </span>
            )}
          </div>
        </div>

        {problem ? (
          <p className="text-destructive text-sm">{problem}</p>
        ) : (
          <div className="bg-secondary/40 flex flex-col gap-1 rounded-xl p-3 text-sm">
            <span>
              Ciclo atual: <strong>{formatDate(startsOn)}</strong> a{' '}
              <strong>{formatDate(endsOn)}</strong>
              {months ? ` (${months} ${months === 1 ? 'mês' : 'meses'})` : ''}
            </span>
            {next && (
              <span className="text-muted-foreground">
                Depois: {formatDate(next.startsOn)} a {formatDate(next.endsOn)}, e assim por diante.
              </span>
            )}
            {startsOn > today && (
              <span className="text-muted-foreground">
                Atrasos e faltas só contam a partir de {formatDate(startsOn)}.
              </span>
            )}
          </div>
        )}

        {canEdit ? (
          <Button
            className="self-start"
            disabled={!changed || Boolean(problem) || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Salvando…' : 'Salvar ciclo'}
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">Só o líder do ministério altera o ciclo.</p>
        )}
      </Panel>
    </section>
  )
}
