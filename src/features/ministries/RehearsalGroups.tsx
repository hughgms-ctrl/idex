import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Split, Trash2 } from 'lucide-react'

import { FormField } from '@/components/FormField'
import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { ministryKeys, useMinistryRoles, useRehearsalGroups } from '@/features/ministries/queries'
import { scheduleKeys } from '@/features/schedule/queries'
import {
  rolesWithoutRehearsal,
  splitBandAndVoices,
  type RehearsalGroup,
} from '@/features/schedule/rehearsal-groups'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'

const WEEKDAYS_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DURATIONS = [60, 90, 120, 150, 180]

// Ensaios separados do culto (ex.: banda e vozes): cada integrante escalado
// vai só ao ensaio da sua função — e só leva falta nele.
export function RehearsalGroups({
  settings,
  churchId,
  canEdit,
}: {
  settings: Tables<'ministry_settings'>
  churchId: string
  canEdit: boolean
}) {
  const ministryId = settings.ministry_id
  const queryClient = useQueryClient()
  const groups = useRehearsalGroups(ministryId).data ?? []
  const roles = useMinistryRoles(ministryId).data ?? []
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ministryKeys.rehearsalGroups(ministryId) })
    await queryClient.invalidateQueries({ queryKey: scheduleKeys.all })
  }
  const base = {
    church_id: churchId,
    ministry_id: ministryId,
    mode: settings.rehearsal_mode,
    days_before: settings.rehearsal_days_before,
    weekday: settings.rehearsal_weekday,
    time: settings.rehearsal_time,
    duration_min: settings.rehearsal_duration_min,
  }

  const create = useMutation({
    mutationFn: async (rows: { name: string; role_ids: string[]; sort_order: number }[]) => {
      const { error } = await supabase
        .from('rehearsal_groups')
        .insert(rows.map((r) => ({ ...base, ...r })))
      if (error) throw error
    },
    onSuccess: async () => {
      await invalidate()
      toast.success('Ensaios criados. Na Escala, "Criar agora" separa os cultos já marcados.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (!settings.rehearsal_enabled) return null
  const split = splitBandAndVoices(roles)
  const left = rolesWithoutRehearsal(roles, groups)
  const nextName = () => {
    for (let n = groups.length + 1; ; n++) {
      const name = `Ensaio ${n}`
      if (!groups.some((g) => g.name === name)) return name
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="Ensaios do culto" />
      <Panel className="border-l-info gap-3 border-l-4">
        <p className="text-muted-foreground text-[13px]">
          {groups.length === 0
            ? 'Hoje cada culto tem um ensaio só, com a equipe toda. Se banda e vozes ensaiam em dias diferentes, separe: cada integrante escalado vai só ao ensaio da sua função e só leva falta nele.'
            : 'Cada integrante escalado no culto vai só ao ensaio da sua função e só leva falta nele. Quem tem duas funções (toca e canta) vai aos dois. Chegada, tolerância e consequência do atraso são as de "Regras de horário".'}
        </p>
        {groups.map((g) => (
          <GroupCard
            key={`${g.id}:${g.role_ids.join(',')}:${g.name}:${g.time}:${g.mode}:${g.days_before}:${g.weekday}:${g.duration_min}`}
            group={g}
            roles={roles}
            canEdit={canEdit}
            onChanged={invalidate}
          />
        ))}
        {groups.length > 0 && left.length > 0 && (
          <p className="border-warning/60 bg-warning/10 rounded-xl border px-3 py-2 text-[13px]">
            Não ensaiam (fora de todos os ensaios): {left.map((r) => r.name).join(', ')}.
          </p>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {groups.length === 0 && (
              <Button
                disabled={create.isPending}
                onClick={() =>
                  create.mutate([
                    { name: 'Ensaio da banda', role_ids: split.band, sort_order: 0 },
                    { name: 'Ensaio de vozes', role_ids: split.voices, sort_order: 1 },
                  ])
                }
              >
                <Split aria-hidden="true" /> Separar banda e vozes
              </Button>
            )}
            <Button
              variant="outline"
              disabled={create.isPending}
              onClick={() =>
                create.mutate([{ name: nextName(), role_ids: [], sort_order: groups.length }])
              }
            >
              <Plus aria-hidden="true" /> {groups.length === 0 ? 'Criar do zero' : 'Outro ensaio'}
            </Button>
          </div>
        )}
      </Panel>
    </section>
  )
}

function GroupCard({
  group,
  roles,
  canEdit,
  onChanged,
}: {
  group: RehearsalGroup
  roles: { id: string; name: string }[]
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const [v, setV] = useState({
    name: group.name,
    roleIds: group.role_ids,
    mode: group.mode,
    daysBefore: String(group.days_before),
    weekday: String(group.weekday ?? 4),
    time: group.time.slice(0, 5),
    duration: String(group.duration_min),
  })
  const dirty =
    v.name !== group.name ||
    v.roleIds.join(',') !== group.role_ids.join(',') ||
    v.mode !== group.mode ||
    v.daysBefore !== String(group.days_before) ||
    (v.mode === 'weekday' && v.weekday !== String(group.weekday ?? '')) ||
    v.time !== group.time.slice(0, 5) ||
    v.duration !== String(group.duration_min)
  const id = (s: string) => `rg-${group.id}-${s}`

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('rehearsal_groups')
        .update({
          name: v.name.trim(),
          role_ids: v.roleIds,
          mode: v.mode,
          days_before: Number(v.daysBefore),
          weekday: v.mode === 'weekday' ? Number(v.weekday) : null,
          time: v.time,
          duration_min: Number(v.duration),
        })
        .eq('id', group.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await onChanged()
      toast.success('Ensaio salvo. Os próximos ensaios já seguem as funções novas.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('rehearsal_groups').delete().eq('id', group.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await onChanged()
      toast.success('Ensaio removido')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const toggle = (roleId: string) =>
    setV({
      ...v,
      roleIds: v.roleIds.includes(roleId)
        ? v.roleIds.filter((r) => r !== roleId)
        : [...v.roleIds, roleId],
    })

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <FormField id={id('name')} label="Nome">
        <Input
          id={id('name')}
          value={v.name}
          maxLength={40}
          disabled={!canEdit}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Funções que vão a este ensaio</span>
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => {
            const on = v.roleIds.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                disabled={!canEdit}
                onClick={() => toggle(r.id)}
                className={cn(
                  'min-h-11 rounded-full border px-3.5 text-sm',
                  on ? 'border-info bg-info/15 text-info font-semibold' : 'text-muted-foreground',
                )}
              >
                {r.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField id={id('mode')} label="Quando">
          <NativeSelect
            id={id('mode')}
            value={v.mode}
            disabled={!canEdit}
            onChange={(e) => setV({ ...v, mode: e.target.value })}
          >
            <option value="weekday">Dia da semana</option>
            <option value="days_before">Dias antes</option>
          </NativeSelect>
        </FormField>
        {v.mode === 'weekday' ? (
          <FormField id={id('weekday')} label="Dia">
            <NativeSelect
              id={id('weekday')}
              value={v.weekday}
              disabled={!canEdit}
              onChange={(e) => setV({ ...v, weekday: e.target.value })}
            >
              {WEEKDAYS_FULL.map((d, i) => (
                <option key={d} value={i}>
                  Toda {d}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        ) : (
          <FormField id={id('days')} label="Dias antes">
            <NativeSelect
              id={id('days')}
              value={v.daysBefore}
              disabled={!canEdit}
              onChange={(e) => setV({ ...v, daysBefore: e.target.value })}
            >
              <option value="0">No mesmo dia</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'dia antes' : 'dias antes'}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <FormField id={id('time')} label="Começa às">
          <Input
            id={id('time')}
            type="time"
            value={v.time}
            disabled={!canEdit}
            onChange={(e) => setV({ ...v, time: e.target.value })}
          />
        </FormField>
        <FormField id={id('duration')} label="Duração">
          <NativeSelect
            id={id('duration')}
            value={v.duration}
            disabled={!canEdit}
            onChange={(e) => setV({ ...v, duration: e.target.value })}
          >
            {[...new Set([...DURATIONS, group.duration_min])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)}h${m % 60}`}
                </option>
              ))}
          </NativeSelect>
        </FormField>
      </div>
      {canEdit && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Remover "${group.name}"? Os próximos ensaios deste grupo serão apagados.`,
                )
              )
                remove.mutate()
            }}
          >
            <Trash2 aria-hidden="true" /> Remover
          </Button>
          <Button
            disabled={!dirty || !v.name.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      )}
    </div>
  )
}
