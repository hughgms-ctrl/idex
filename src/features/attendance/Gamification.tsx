import { Link } from 'react-router'
import { Flame, Settings2, Target } from 'lucide-react'

import { Panel, SectionTitle } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { useMonthStats } from '@/features/attendance/queries'
import { BADGE_ICON, useGamification } from '@/features/attendance/use-gamification'
import { describeRules, type RulesSettings } from '@/features/attendance/rules-text'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database'
import { onTimeRate, recoveryProgress, safetyMargin, streaks, tally } from '@domain/gamification.ts'
import { normalizeTiers } from '@domain/points.ts'

type Settings = Tables<'ministry_settings'>

export function StreakAndBadges({
  memberId,
  settings,
}: {
  memberId: string
  settings: Settings | null
}) {
  const g = useGamification(memberId, settings)
  if (!g) return null
  const earned = g.badges.filter((b) => b.earned).length
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-2xl',
            g.streak.current > 0
              ? 'bg-primary/15 text-primary'
              : 'bg-secondary text-muted-foreground',
          )}
        >
          <Flame className="size-6" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-2xl leading-none font-bold">
            {g.streak.current}{' '}
            <span className="text-muted-foreground text-sm font-normal">
              {g.streak.current === 1 ? 'compromisso seguido' : 'seguidos'} no horário
            </span>
          </span>
          <span className="text-muted-foreground text-xs">
            Seu recorde: {g.streak.best} · atraso ou falta zera, aviso aprovado não
          </span>
        </div>
      </div>
      {g.next && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span>
              Próximo selo: <strong>{g.next.title}</strong>
            </span>
            <span className="text-muted-foreground font-mono">
              {g.next.current}/{g.next.target}
            </span>
          </div>
          <div className="bg-border h-1.5 overflow-hidden rounded">
            <div
              className="bg-primary h-1.5"
              style={{ width: `${(g.next.current / g.next.target) * 100}%` }}
            />
          </div>
          <span className="text-muted-foreground text-xs">{g.next.description}</span>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t pt-3">
        <h3 className="text-[15px] font-semibold">Selos</h3>
        <span className="text-muted-foreground text-xs">
          {earned} de {g.badges.length}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {g.badges.map((b) => {
          const Icon = BADGE_ICON[b.id]
          return (
            <li
              key={b.id}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-2 text-center',
                b.earned ? 'border-primary/40 bg-primary/5' : 'opacity-60',
              )}
              title={b.description}
            >
              <Icon
                className={cn('size-6', b.earned ? 'text-primary' : 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className="text-[12px] leading-tight font-medium">{b.title}</span>
              <span className="text-muted-foreground font-mono text-[11px]">
                {b.earned ? 'conquistado' : `${b.current}/${b.target}`}
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

/** Linha curta para o Início: sequência e próximo selo, leva à Presença. */
export function StreakLine({
  memberId,
  settings,
}: {
  memberId: string
  settings: Settings | null
}) {
  const g = useGamification(memberId, settings)
  if (!g) return null
  return (
    <Link
      to="/presenca"
      className="bg-secondary/50 hover:bg-secondary flex min-h-11 items-center gap-2 rounded-xl px-3 text-[13px]"
    >
      <Flame
        className={cn('size-4', g.streak.current > 0 ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span className="flex-1">
        <strong>{g.streak.current}</strong> seguidos no horário
        {g.next && (
          <span className="text-muted-foreground">
            {' '}
            · {g.next.title} {g.next.current}/{g.next.target}
          </span>
        )}
      </span>
      <span className="text-primary text-xs font-medium">Selos</span>
    </Link>
  )
}

/** "Você está 15 acima do mínimo: ainda cabem 3 atrasos ou nenhuma falta." */
export function MarginText({ balance, settings }: { balance: number; settings: Settings }) {
  const m = safetyMargin({
    balance,
    minPoints: settings.cycle_min_points,
    lateTiers: normalizeTiers(settings.late_penalty_tiers),
    absencePenalty: settings.absence_penalty,
  })
  if (!m.above) {
    return (
      <p className="text-warning text-[13px] font-medium">
        Faltam {m.missing} pontos para o mínimo ({settings.cycle_min_points}).
        {settings.recovery_enabled && ' Presenças seguidas no horário recuperam pontos.'}
      </p>
    )
  }
  if (m.points === 0) {
    return (
      <p className="text-warning text-[13px] font-medium">
        Você está no limite: qualquer desconto deixa você abaixo do mínimo.
      </p>
    )
  }
  const lates = m.lates === 1 ? '1 atraso' : `${m.lates} atrasos`
  const absences =
    m.absences === 0 ? 'nenhuma falta' : m.absences === 1 ? '1 falta' : `${m.absences} faltas`
  return (
    <p className="text-[13px]">
      Você está <strong className="text-primary">{m.points} pontos acima do mínimo</strong>: ainda
      cabem {lates} (−{m.latePoints}) ou {absences} sem aviso.
    </p>
  )
}

/** Bolinhas de "N presenças no horário para recuperar +X". */
export function RecoveryMeter({
  memberId,
  settings,
  balance,
  ledger,
}: {
  memberId: string
  settings: Settings
  balance: number
  ledger: {
    delta: number
    reason: string
    created_at: string
    events: { starts_at: string } | null
  }[]
}) {
  const g = useGamification(memberId, settings)
  if (!g) return null
  const p = recoveryProgress({
    rule: {
      enabled: settings.recovery_enabled,
      every: settings.recovery_every,
      points: settings.recovery_points,
    },
    balance,
    startingPoints: settings.cycle_starting_points,
    scored: g.scored,
    ledger: ledger.map((e) => ({
      delta: e.delta,
      reason: e.reason,
      at: e.events?.starts_at ?? e.created_at,
    })),
  })
  if (!p.active) return null
  return (
    <div className="bg-secondary/50 flex flex-col gap-2 rounded-xl p-3">
      <span className="text-[13px]">
        Recupere <strong className="text-primary">+{p.points}</strong>: faltam {p.every - p.count}{' '}
        {p.every - p.count === 1 ? 'presença' : 'presenças'} no horário
      </span>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: p.every }, (_, i) => (
          <span
            key={i}
            className={cn('h-2 flex-1 rounded-full', i < p.count ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </div>
    </div>
  )
}

const MONTH = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'long' })

/** Meta coletiva do mês e destaques (só o positivo, sem ranking). */
export function TeamGoal({ ministryId }: { ministryId: string }) {
  const stats = useMonthStats(ministryId)
  const s = stats.data
  if (!s) return null
  const rate = onTimeRate({ onTime: s.on_time, late: s.late, absent: s.absent })
  return (
    <Panel>
      <div className="flex items-center gap-2">
        <Target className="text-primary size-5" aria-hidden="true" />
        <h2 className="text-[15px] font-semibold">Equipe em {MONTH.format(new Date())}</h2>
      </div>
      {rate === null ? (
        <p className="text-muted-foreground text-[13px]">
          Ainda sem compromissos neste mês. Meta: {s.goal}% no horário.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold">
              <span className={rate >= s.goal ? 'text-primary' : ''}>{rate}%</span>{' '}
              <span className="text-muted-foreground text-sm font-normal">no horário</span>
            </span>
            <span className="text-muted-foreground text-[13px]">meta {s.goal}%</span>
          </div>
          <div className="bg-border relative h-2 rounded">
            <div
              className={cn('h-2 rounded', rate >= s.goal ? 'bg-primary' : 'bg-info')}
              style={{ width: `${rate}%` }}
            />
            <span
              className="bg-foreground absolute -top-1 h-4 w-0.5 rounded"
              style={{ left: `${s.goal}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="text-muted-foreground text-[13px]">
            {rate >= s.goal
              ? 'Meta batida! Bora manter.'
              : `Faltam ${s.goal - rate} pontos percentuais para a meta.`}
          </p>
        </>
      )}
      {s.highlights.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <span className="text-[13px] font-semibold">Destaques do mês · 100% no horário</span>
          <span className="text-muted-foreground text-[13px]">{s.highlights.join(' · ')}</span>
        </div>
      )}
    </Panel>
  )
}

/** Resumo do último ciclo fechado. */
export function LastCycleSummary({
  memberId,
  settings,
}: {
  memberId: string
  settings: Settings | null
}) {
  const g = useGamification(memberId, settings)
  const last = g && [...g.closedCycles].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0]
  if (!g || !last || !settings) return null
  const from = Date.parse(`${last.startsOn}T00:00:00-03:00`)
  const to = Date.parse(`${last.endsOn}T23:59:59-03:00`)
  const inCycle = g.scored.filter((c) => {
    const at = Date.parse(c.startsAt)
    return at >= from && at <= to
  })
  const t = tally(inCycle)
  const rate = onTimeRate(t)
  return (
    <Panel>
      <h2 className="text-[15px] font-semibold">
        Seu último ciclo · {formatDate(last.startsOn)} a {formatDate(last.endsOn)}
      </h2>
      <ul className="grid grid-cols-3 gap-2 text-center">
        <li className="bg-secondary/50 flex flex-col rounded-xl p-2">
          <span className="font-display text-xl font-bold">{t.onTime}</span>
          <span className="text-muted-foreground text-[11px]">
            no horário{rate !== null ? ` (${rate}%)` : ''}
          </span>
        </li>
        <li className="bg-secondary/50 flex flex-col rounded-xl p-2">
          <span className="font-display text-xl font-bold">{streaks(inCycle).best}</span>
          <span className="text-muted-foreground text-[11px]">maior sequência</span>
        </li>
        <li className="bg-secondary/50 flex flex-col rounded-xl p-2">
          <span
            className={cn(
              'font-display text-xl font-bold',
              last.balance >= settings.cycle_min_points ? 'text-primary' : 'text-warning',
            )}
          >
            {last.balance}
          </span>
          <span className="text-muted-foreground text-[11px]">saldo final</span>
        </li>
      </ul>
    </Panel>
  )
}

/** As regras do ministério em frases, com as configurações de verdade. */
export function RulesCard({ settings, leader }: { settings: RulesSettings; leader: boolean }) {
  const groups = describeRules(settings)
  return (
    <section className="border-input flex flex-col gap-3 rounded-2xl border border-dashed p-4">
      <SectionTitle
        title="Como funcionam os pontos aqui"
        action={
          leader && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/configuracoes">
                <Settings2 aria-hidden="true" /> Ajustar
              </Link>
            </Button>
          )
        }
      />
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <h3 className="text-[13px] font-semibold">{g.title}</h3>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed">
            {g.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
