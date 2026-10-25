// "Como funcionam os pontos aqui": as regras do ministério em frases curtas,
// montadas com as configurações reais (função pura).

import { normalizeTiers, type PenaltyTier } from '@domain/points.ts'

export type RulesSettings = {
  cycle_starting_points: number
  cycle_min_points: number
  late_penalty_tiers: unknown
  absence_penalty: number
  service_arrival_minutes: number
  service_tolerance_min: number
  service_late_consequence: string
  rehearsal_enabled: boolean
  rehearsal_arrival_minutes: number
  rehearsal_tolerance_min: number
  rehearsal_late_consequence: string
  rehearsal_forgot_policy: string
  rehearsal_excused_policy: string
  checkin_request_deadline_hours: number
  checkin_request_limit_per_cycle: number
  recovery_enabled: boolean
  recovery_every: number
  recovery_points: number
}

export type RuleGroup = { title: string; lines: string[] }

export function tiersText(tiers: PenaltyTier[], tolerance: number): string {
  return tiers
    .map((t, i, arr) => {
      const from = arr[i - 1]?.upToMin ?? tolerance
      return t.upToMin === null
        ? `mais de ${from} min: −${t.points}`
        : `até ${t.upToMin} min: −${t.points}`
    })
    .join(' · ')
}

export function describeRules(s: RulesSettings): RuleGroup[] {
  const tiers = normalizeTiers(s.late_penalty_tiers)
  const groups: RuleGroup[] = []

  groups.push({
    title: 'Ciclo',
    lines: [
      `Todo mundo começa o ciclo com ${s.cycle_starting_points} pontos (quem entra no meio também).`,
      `Com ${s.cycle_min_points} ou mais no fim do ciclo, você continua na escala do próximo. Abaixo disso, você não fica elegível para a escala do próximo ciclo.`,
      'Vale para todo mundo, liderança inclusive.',
    ],
  })

  const service = [
    `A chegada da equipe é ${s.service_arrival_minutes} min antes do início. O atraso conta a partir da chegada, não do início do culto.`,
    `Tolerância: ${s.service_tolerance_min} min. Passou disso, conta o atraso inteiro: ${tiersText(tiers, s.service_tolerance_min)}.`,
  ]
  if (s.service_late_consequence === 'no_play')
    service.push('Quem chega depois da tolerância não toca naquele culto.')
  groups.push({ title: 'Culto', lines: service })

  if (s.rehearsal_enabled) {
    const rehearsal = [
      `A chegada é ${s.rehearsal_arrival_minutes} min antes do início do ensaio. Tolerância: ${s.rehearsal_tolerance_min} min.`,
    ]
    if (s.rehearsal_late_consequence === 'out_rehearsal')
      rehearsal.push('Quem chega depois da tolerância fica fora do ensaio.')
    if (s.rehearsal_late_consequence === 'out_rehearsal_and_service') {
      rehearsal.push(
        'Quem chega depois da tolerância, ou falta, fica fora do ensaio e do culto daquele ensaio.',
      )
      rehearsal.push(
        s.rehearsal_forgot_policy === 'keep_until_reviewed'
          ? 'Esqueceu de registrar no ensaio? Com o pedido feito, você segue na escala até o líder decidir.'
          : 'Esqueceu de registrar no ensaio? Fica fora do culto até o líder aprovar o pedido.',
      )
      rehearsal.push(
        s.rehearsal_excused_policy === 'out_of_service'
          ? 'Faltou ao ensaio, mesmo com aviso aprovado: não toca no culto.'
          : 'Faltou ao ensaio com aviso aprovado: continua no culto.',
      )
    }
    groups.push({ title: 'Ensaio', lines: rehearsal })
  }

  groups.push({
    title: 'Faltas e avisos',
    lines: [
      `Falta sem aviso: −${s.absence_penalty}.`,
      'Vai atrasar ou faltar? Avise pelo app antes do início do evento. Aviso aprovado pelo líder não desconta.',
      `Esqueceu de registrar? Peça o registro em até ${s.checkin_request_deadline_hours} h depois do evento (até ${s.checkin_request_limit_per_cycle} por ciclo; acima disso o líder é alertado).`,
    ],
  })

  if (s.recovery_enabled) {
    groups.push({
      title: 'Recuperar pontos',
      lines: [
        `A cada ${s.recovery_every} presenças seguidas no horário depois de um desconto, você recupera +${s.recovery_points} (até voltar a ${s.cycle_starting_points}).`,
      ],
    })
  }
  return groups
}
