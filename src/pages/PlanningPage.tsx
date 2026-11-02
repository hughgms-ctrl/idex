import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Sparkles, Tags } from 'lucide-react'
import {
  analyzePlan,
  suggestFill,
  totalPerService,
  type CategorySlot,
  type PlannedService,
  type PlanRules,
  type SongCategories,
} from '@domain/planning.ts'
import { addMonths, localDateKey, localParts, monthRange } from '@domain/time.ts'

import { ErrorState } from '@/components/ErrorState'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { useMinistryMembers } from '@/features/members/queries'
import { useMinistryRoles } from '@/features/ministries/queries'
import { planningKeys, setlistOf, usePlanData, usePlanRules } from '@/features/planning/queries'
import { MONTH_NAMES } from '@/features/schedule/datetime'
import { EventDialog } from '@/features/schedule/EventDialog'
import { ContinueSeries } from '@/features/schedule/ContinueSeries'
import { MissingRehearsals } from '@/features/schedule/MissingRehearsals'
import { songKeys } from '@/features/songs/queries'
import { CategoryList, SlotsEditor } from '@/features/planning/CategoryRules'
import { CategorizeSongsDialog } from '@/features/songs/CategorizeSongsDialog'
import {
  describeSlots,
  parseSlots,
  useSongCategories,
  type SongCategory,
} from '@/features/songs/categories'
import { errorMessage } from '@/lib/errors'
import { formatDayMonth } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function PlanningPage() {
  const { ministry, isLeader } = useChurch()
  const now = localParts(new Date())
  const [base, setBase] = useState({ year: now.year, month: now.month })
  const [suggested, setSuggested] = useState<Map<string, string[]> | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [classifyOpen, setClassifyOpen] = useState(false)
  const [newService, setNewService] = useState(false)
  const queryClient = useQueryClient()
  const leader = ministry ? isLeader(ministry.id) : false

  const months = [0, 1, 2].map((d) => addMonths(base.year, base.month, d))
  const start = monthRange(months[0]!.year, months[0]!.month).start
  const end = monthRange(months[2]!.year, months[2]!.month).end
  const data = usePlanData(ministry?.id, start, end)
  const rulesRow = usePlanRules(ministry?.id)
  const members = useMinistryMembers(ministry?.id)
  const roles = useMinistryRoles(ministry?.id)
  const categoryList = useSongCategories(ministry?.id).data ?? []
  const categoryName = new Map(categoryList.map((c) => [c.id, c.name]))

  const rules: PlanRules = {
    minWeeksBetweenRepeats: rulesRow.data?.min_weeks_between_repeats ?? 4,
    maxNewSongsPerMonth: rulesRow.data?.max_new_songs_per_month ?? 2,
    songsPerService: rulesRow.data?.songs_per_service ?? 5,
    slots: parseSlots(
      rulesRow.data?.category_slots,
      categoryList.map((c) => c.id),
    ),
  }
  const total = totalPerService(rules)
  // tipos de cada música (objeto simples)
  const songCategories: SongCategories = Object.fromEntries(
    (data.data?.songs ?? []).map((s) => [s.id, s.category_ids ?? []]),
  )

  const planned: PlannedService[] = useMemo(
    () =>
      (data.data?.services ?? []).map((s) => ({
        eventId: s.id,
        startsAt: s.starts_at,
        songIds: [...(setlistOf(s)?.setlist_items ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((i) => i.song_id),
      })),
    [data.data],
  )
  const withSuggestions = planned.map((s) => ({
    ...s,
    songIds: [...s.songIds, ...(suggested?.get(s.eventId) ?? [])],
  }))
  const newSongIds = new Set((data.data?.songs ?? []).filter((s) => s.is_new).map((s) => s.id))
  const analysis = analyzePlan({
    services: withSuggestions,
    history: data.data?.history ?? [],
    rules,
    newSongIds,
    categories: songCategories,
  })
  const songById = new Map((data.data?.songs ?? []).map((s) => [s.id, s]))
  const ministerRoleIds = new Set(
    (roles.data ?? []).filter((r) => /^ministr/i.test(r.name)).map((r) => r.id),
  )
  const memberName = new Map((members.data ?? []).map((m) => [m.id, m.name.split(' ')[0]]))

  // desfaz um "Salvar sugestões" (tira as músicas e os setlists criados)
  const undo = useMutation({
    mutationFn: async (saved: { itemIds: string[]; setlistIds: string[] }) => {
      if (saved.itemIds.length) {
        const { error } = await supabase.from('setlist_items').delete().in('id', saved.itemIds)
        if (error) throw error
      }
      if (saved.setlistIds.length) {
        const { error } = await supabase.from('setlists').delete().in('id', saved.setlistIds)
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['planning'] })
      await queryClient.invalidateQueries({ queryKey: songKeys.all })
      toast.success('Sugestões desfeitas')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const save = useMutation({
    mutationFn: async () => {
      const saved = { count: 0, services: 0, itemIds: [] as string[], setlistIds: [] as string[] }
      if (!suggested || !data.data) return saved
      for (const service of data.data.services) {
        const add = suggested.get(service.id)
        if (!add?.length) continue
        let setlistId = setlistOf(service)?.id
        if (!setlistId) {
          const { data: created, error } = await supabase
            .from('setlists')
            .insert({ church_id: ministry!.church_id, event_id: service.id })
            .select('id')
            .single()
          if (error) throw error
          setlistId = created.id
          saved.setlistIds.push(created.id)
        }
        const startPos =
          Math.max(-1, ...(setlistOf(service)?.setlist_items ?? []).map((i) => i.position)) + 1
        const { data: inserted, error } = await supabase
          .from('setlist_items')
          .insert(
            add.map((songId, i) => ({
              church_id: ministry!.church_id,
              setlist_id: setlistId!,
              song_id: songId,
              position: startPos + i,
              key: songById.get(songId)?.original_key ?? null,
            })),
          )
          .select('id')
        if (error) throw error
        saved.itemIds.push(...inserted.map((i) => i.id))
        saved.count += add.length
        saved.services += 1
      }
      return saved
    },
    onSuccess: async (saved) => {
      setSuggested(null)
      await queryClient.invalidateQueries({ queryKey: ['planning'] })
      await queryClient.invalidateQueries({ queryKey: songKeys.all })
      toast.success(`${saved.count} músicas incluídas em ${saved.services} cultos`, {
        duration: 15_000,
        action: { label: 'Desfazer', onClick: () => undo.mutate(saved) },
      })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (!ministry) return null
  if (data.error) return <ErrorState error={data.error} onRetry={() => void data.refetch()} />

  const first = months[0]!
  const last = months[2]!
  const breaks = analysis.alerts.filter((a) => a.kind !== 'missing_songs')
  const emptyServices = withSuggestions.filter((s) => s.songIds.length === 0).length

  return (
    <>
      {leader && ministry && (
        <EventDialog open={newService} onOpenChange={setNewService} ministry={ministry} />
      )}
      {leader && ministry && (
        <ContinueSeries
          ministry={ministry}
          untilKey={localDateKey(new Date(end.getTime() - 60_000))}
        />
      )}
      {leader && ministry && <MissingRehearsals ministry={ministry} />}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-primary text-xs font-semibold tracking-wider">
            REPERTÓRIO TRIMESTRAL
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Trimestre anterior"
              onClick={() => {
                setSuggested(null)
                setBase(addMonths(base.year, base.month, -3))
              }}
            >
              <ChevronLeft />
            </Button>
            <h1 className="font-display text-[28px] leading-tight font-bold md:text-[34px]">
              {SHORT[first.month - 1]} {first.year !== last.year ? first.year : ''} –{' '}
              {SHORT[last.month - 1]} {last.year}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Próximo trimestre"
              onClick={() => {
                setSuggested(null)
                setBase(addMonths(base.year, base.month, 3))
              }}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        {leader && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setNewService(true)}>
              <Plus aria-hidden="true" /> Novo culto
            </Button>
            <Button variant="outline" onClick={() => setClassifyOpen(true)}>
              <Tags aria-hidden="true" /> Classificar músicas
            </Button>
            {suggested ? (
              <>
                <Button variant="outline" onClick={() => setSuggested(null)}>
                  Descartar
                </Button>
                <Button
                  onClick={() => {
                    const n = [...suggested.values()].reduce((k, l) => k + l.length, 0)
                    const cultos = [...suggested.values()].filter((l) => l.length).length
                    if (
                      window.confirm(
                        `Incluir ${n} ${n === 1 ? 'música' : 'músicas'} em ${cultos} ${cultos === 1 ? 'culto' : 'cultos'}?`,
                      )
                    )
                      save.mutate()
                  }}
                  disabled={save.isPending}
                >
                  {save.isPending ? 'Salvando…' : 'Salvar sugestões'}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                disabled={!data.data}
                onClick={() => {
                  const fill = suggestFill({
                    services: planned,
                    history: data.data?.history ?? [],
                    catalog: (data.data?.songs ?? []).map((s) => ({ id: s.id, title: s.title })),
                    rules,
                    newSongIds,
                    categories: songCategories,
                  })
                  const added = [...fill.values()].reduce((n, l) => n + l.length, 0)
                  if (added === 0)
                    toast(
                      'Nada a sugerir: os cultos já estão completos ou faltam músicas no repertório.',
                    )
                  setSuggested(added ? fill : null)
                }}
              >
                <Sparkles aria-hidden="true" /> Sugerir com regras
              </Button>
            )}
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          `Não repetir em menos de ${rules.minWeeksBetweenRepeats} semanas`,
          `Máx. ${rules.maxNewSongsPerMonth} ${rules.maxNewSongsPerMonth === 1 ? 'música nova' : 'músicas novas'} por mês`,
          `${total} músicas por culto`,
          ...(rules.slots?.length
            ? [`Ordem: ${describeSlots(rules.slots, (id) => categoryName.get(id))}`]
            : []),
          'Tom conforme ministro escalado',
        ].map((label) => (
          <span key={label} className="bg-card rounded-2xl border px-3 py-1.5 text-[13px]">
            {label}
          </span>
        ))}
        {leader && (
          <Button variant="ghost" size="sm" onClick={() => setRulesOpen(true)}>
            Ajustar regras
          </Button>
        )}
      </div>

      {suggested && (
        <p className="border-primary rounded-xl border border-dashed px-3 py-2 text-[13px]">
          Sugestões em destaque tracejado. Revise e toque em <strong>Salvar sugestões</strong> para
          incluir nos setlists.
        </p>
      )}

      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {months.map((m) => {
            const key = `${m.year}-${String(m.month).padStart(2, '0')}`
            const monthServices = (data.data?.services ?? []).filter(
              (s) =>
                localParts(s.starts_at).month === m.month &&
                localParts(s.starts_at).year === m.year,
            )
            const news = analysis.newPerMonth.get(key) ?? 0
            const monthAlerts = breaks.filter(
              (a) =>
                (a.kind === 'too_many_new' && a.month === key) ||
                (a.kind === 'repeat' && monthServices.some((s) => s.id === a.eventId)),
            ).length
            return (
              <section key={key} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-lg font-semibold">{MONTH_NAMES[m.month - 1]}</h2>
                  <span className="text-muted-foreground text-xs">
                    {monthServices.length} {monthServices.length === 1 ? 'culto' : 'cultos'} ·{' '}
                    {news} {news === 1 ? 'nova' : 'novas'}
                    {monthAlerts
                      ? ` · ${monthAlerts} ${monthAlerts === 1 ? 'alerta' : 'alertas'}`
                      : ''}
                  </span>
                </div>
                {monthServices.length === 0 && (
                  <p className="text-muted-foreground rounded-[14px] border border-dashed px-3 py-4 text-center text-[13px]">
                    Nenhum culto cadastrado.{' '}
                    <Link to="/escalas" className="text-primary underline">
                      Criar na Escala
                    </Link>
                  </p>
                )}
                {monthServices.map((service) => {
                  const minister = service.schedule_assignments.find(
                    (a) => a.ministry_role_id && ministerRoleIds.has(a.ministry_role_id),
                  )
                  const items = [...(setlistOf(service)?.setlist_items ?? [])].sort(
                    (a, b) => a.position - b.position,
                  )
                  const extra = suggested?.get(service.id) ?? []
                  const flags = new Map(
                    (analysis.flags.get(service.id) ?? []).map((f) => [f.songId, f]),
                  )
                  const missing = total - items.length - extra.length
                  const missingTypes = analysis.alerts.flatMap((a) =>
                    a.kind === 'missing_category' && a.eventId === service.id
                      ? [`${a.missing} ${categoryName.get(a.categoryId) ?? 'tipo'}`]
                      : [],
                  )
                  const rows = [
                    ...items.map((i) => ({ songId: i.song_id, key: i.key, suggestedRow: false })),
                    ...extra.map((id) => ({
                      songId: id,
                      key: songById.get(id)?.original_key ?? null,
                      suggestedRow: true,
                    })),
                  ]
                  return (
                    <Link
                      key={service.id}
                      to={`/repertorio/culto/${service.id}`}
                      className="bg-card hover:border-input flex flex-col gap-2 rounded-[14px] border p-3"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[15px] font-semibold">
                          {formatDayMonth(service.starts_at)}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {minister ? memberName.get(minister.ministry_member_id) : 'Sem ministro'}
                        </span>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {rows.map((r) => {
                          const f = flags.get(r.songId)
                          return (
                            <li
                              key={r.songId}
                              className={cn(
                                'flex items-center gap-2 text-[13px]',
                                r.suggestedRow &&
                                  'border-primary/60 rounded-md border border-dashed px-1.5 py-0.5',
                              )}
                            >
                              <span className="text-primary w-[26px] font-mono text-xs font-semibold">
                                {r.key ?? '—'}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {songById.get(r.songId)?.title ?? 'Música'}
                              </span>
                              {(songCategories[r.songId] ?? [])[0] && (
                                <span className="text-muted-foreground max-w-[84px] shrink-0 truncate text-[11px]">
                                  {categoryName.get((songCategories[r.songId] ?? [])[0]!)}
                                </span>
                              )}
                              {f?.isNew && (
                                <span className="bg-info text-primary-foreground rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold">
                                  NOVA
                                </span>
                              )}
                              {f?.repeatAfterWeeks !== null &&
                                f?.repeatAfterWeeks !== undefined && (
                                  <span className="bg-warning text-primary-foreground rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold">
                                    {f.repeatAfterWeeks} SEM
                                  </span>
                                )}
                            </li>
                          )
                        })}
                      </ul>
                      {missing > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {missing} {missing === 1 ? 'lugar vazio' : 'lugares vazios'}
                        </span>
                      )}
                      {missingTypes.length > 0 && (rows.length > 0 || missing <= 0) && (
                        <span className="text-warning text-xs">
                          Falta: {missingTypes.join(', ')}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </section>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Músicas diferentes', value: analysis.stats.distinct, cls: '' },
          { label: 'Novas no trimestre', value: analysis.stats.newCount, cls: 'text-info' },
          {
            label: 'Quebras de regra',
            value: analysis.stats.ruleBreaks,
            cls: analysis.stats.ruleBreaks ? 'text-warning' : '',
          },
          {
            label: 'Cultos sem setlist',
            value: emptyServices,
            cls: emptyServices ? 'text-warning' : '',
          },
        ].map((t) => (
          <div key={t.label} className="bg-card flex flex-col gap-1 rounded-[14px] border p-3.5">
            <span className="text-muted-foreground text-xs">{t.label}</span>
            <span className={cn('font-mono text-[26px] font-semibold', t.cls)}>{t.value}</span>
          </div>
        ))}
      </div>

      {leader && rulesRow.data && (
        <RulesDialog
          key={`${rulesRow.data.updated_at}:${categoryList.length}`}
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          churchId={ministry.church_id}
          ministryId={ministry.id}
          initial={rules}
          categories={categoryList}
        />
      )}
      {leader && (
        <CategorizeSongsDialog
          open={classifyOpen}
          onOpenChange={setClassifyOpen}
          songs={(data.data?.songs ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            category_ids: s.category_ids ?? [],
          }))}
          categories={categoryList}
        />
      )}
    </>
  )
}

function RulesDialog({
  open,
  onOpenChange,
  churchId,
  ministryId,
  initial,
  categories,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  churchId: string
  ministryId: string
  initial: PlanRules
  categories: SongCategory[]
}) {
  const queryClient = useQueryClient()
  const [v, setV] = useState({
    weeks: String(initial.minWeeksBetweenRepeats),
    news: String(initial.maxNewSongsPerMonth),
    perService: String(initial.songsPerService),
  })
  const [slots, setSlots] = useState<CategorySlot[]>(initial.slots ?? [])
  const validSlots = slots.filter((s) => categories.some((c) => c.id === s.categoryId))
  const slotsTotal = validSlots.reduce((n, s) => n + s.count, 0)
  const save = useMutation({
    mutationFn: async () => {
      const weeks = Number(v.weeks)
      const news = Number(v.news)
      const perService = Number(v.perService)
      if (
        ![weeks, news, perService].every((n) => Number.isInteger(n) && n >= 0) ||
        perService < 1 ||
        perService > 20
      ) {
        throw new Error('Use números inteiros (músicas por culto entre 1 e 20)')
      }
      const { error } = await supabase
        .from('quarter_plan_rules')
        .update({
          min_weeks_between_repeats: weeks,
          max_new_songs_per_month: news,
          // a estrutura do culto manda no total, se for maior
          songs_per_service: Math.min(20, Math.max(perService, slotsTotal)),
          category_slots: validSlots,
        })
        .eq('ministry_id', ministryId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: planningKeys.rules(ministryId) })
      toast.success('Regras salvas')
      onOpenChange(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regras do repertório</DialogTitle>
          <DialogDescription>Usadas nos alertas e no “Sugerir com regras”.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <FormField id="rule-weeks" label="Não repetir (semanas)">
            <Input
              id="rule-weeks"
              type="number"
              min={0}
              value={v.weeks}
              onChange={(e) => setV({ ...v, weeks: e.target.value })}
            />
          </FormField>
          <FormField id="rule-news" label="Novas por mês">
            <Input
              id="rule-news"
              type="number"
              min={0}
              value={v.news}
              onChange={(e) => setV({ ...v, news: e.target.value })}
            />
          </FormField>
          <FormField id="rule-per" label="Músicas por culto">
            <Input
              id="rule-per"
              type="number"
              min={1}
              max={20}
              value={v.perService}
              onChange={(e) => setV({ ...v, perService: e.target.value })}
            />
          </FormField>
        </div>
        <section className="flex flex-col gap-2 border-t pt-3">
          <h3 className="text-sm font-semibold">Tipos de música</h3>
          <p className="text-muted-foreground text-[13px]">
            Ex.: celebração, louvor, adoração. Cada música pode ter mais de um tipo (marque em
            “Classificar músicas” ou no cadastro da música).
          </p>
          <CategoryList churchId={churchId} ministryId={ministryId} categories={categories} />
        </section>
        <section className="flex flex-col gap-2 border-t pt-3">
          <h3 className="text-sm font-semibold">Ordem do culto</h3>
          <p className="text-muted-foreground text-[13px]">
            Quantas músicas de cada tipo, na ordem em que entram. O “Sugerir com regras” preenche
            cada parte com músicas daquele tipo.
          </p>
          <SlotsEditor categories={categories} value={slots} onChange={setSlots} />
          {slotsTotal > Number(v.perService) && (
            <p className="text-info text-[13px]">
              A ordem soma {slotsTotal} músicas: o culto passa a ter {Math.min(20, slotsTotal)}.
            </p>
          )}
        </section>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
