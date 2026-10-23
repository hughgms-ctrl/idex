// Situação de cada escalado no painel ao vivo do líder (função pura).

export type LiveTone = 'ok' | 'late' | 'justified' | 'absent' | 'waiting' | 'pending'

export type LiveStatus = { tone: LiveTone; label: string; time: string | null }

export type LiveData = {
  checkins: { ministry_member_id: string; arrived_at: string; late_minutes: number }[]
  justifications: { ministry_member_id: string; status: string }[]
  requests: { ministry_member_id: string; status: string }[]
  ledger: { ministry_member_id: string; delta: number; reason: string }[]
}

export function liveStatus(params: {
  memberId: string
  data: LiveData
  eventEnded: boolean
  toleranceMin: number
}): LiveStatus {
  const { memberId, data, eventEnded, toleranceMin } = params
  const checkin = data.checkins.find((c) => c.ministry_member_id === memberId)
  const justification = data.justifications.find((j) => j.ministry_member_id === memberId)
  const request = data.requests.find((r) => r.ministry_member_id === memberId)
  const penalty = data.ledger
    .filter((l) => l.ministry_member_id === memberId && l.reason !== 'cycle_start')
    .reduce((sum, l) => sum + l.delta, 0)

  if (checkin) {
    if (checkin.late_minutes <= toleranceMin)
      return { tone: 'ok', label: 'NO HORÁRIO', time: checkin.arrived_at }
    if (justification?.status === 'approved')
      return { tone: 'justified', label: 'JUSTIFICOU', time: checkin.arrived_at }
    return {
      tone: 'late',
      label: penalty < 0 ? `ATRASO ${penalty}` : `ATRASO ${checkin.late_minutes} MIN`,
      time: checkin.arrived_at,
    }
  }
  if (justification?.status === 'approved')
    return { tone: 'justified', label: 'JUSTIFICOU', time: null }
  if (request?.status === 'pending' || justification?.status === 'pending') {
    return { tone: 'pending', label: 'EM ANÁLISE', time: null }
  }
  if (penalty < 0) return { tone: 'absent', label: `FALTA ${penalty}`, time: null }
  if (eventEnded) return { tone: 'absent', label: 'NÃO VEIO', time: null }
  return { tone: 'waiting', label: 'AGUARDANDO', time: null }
}
