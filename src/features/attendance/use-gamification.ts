import {
  CircleCheckBig,
  Flame,
  Guitar,
  Handshake,
  Mountain,
  Speaker,
  Sunrise,
  Timer,
  Trophy,
  type LucideIcon,
} from 'lucide-react'

import { useMyHistory } from '@/features/attendance/queries'
import { useNow } from '@/lib/use-now'
import type { Tables } from '@/types/database'
import {
  badges as computeBadges,
  nextBadge,
  scoreCommitments,
  streaks,
  type BadgeId,
} from '@domain/gamification.ts'

type Settings = Tables<'ministry_settings'>

export const BADGE_ICON: Record<BadgeId, LucideIcon> = {
  first: CircleCheckBig,
  streak5: Flame,
  streak10: Timer,
  streak25: Mountain,
  early: Sunrise,
  soundcheck: Speaker,
  rehearsals: Guitar,
  reliable: Handshake,
  perfect_cycle: Trophy,
}

function tolerancesOf(s: Settings) {
  return {
    service: s.service_tolerance_min,
    rehearsal: s.rehearsal_tolerance_min,
    other: s.late_tolerance_min,
  }
}

/** Sequência, selos e o próximo selo do integrante. */
export function useGamification(memberId: string | undefined, settings: Settings | null) {
  const history = useMyHistory(memberId)
  const now = useNow()
  if (!history.data || !settings) return null
  const scored = scoreCommitments(history.data.commitments, tolerancesOf(settings), now)
  const list = computeBadges({
    scored,
    closedCycles: history.data.closedCycles,
    startingPoints: settings.cycle_starting_points,
  })
  return {
    fetching: history.isFetching,
    scored,
    closedCycles: history.data.closedCycles,
    streak: streaks(scored),
    badges: list,
    next: nextBadge(list),
  }
}
