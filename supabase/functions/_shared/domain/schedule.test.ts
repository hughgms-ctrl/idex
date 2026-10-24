import { describe, expect, it } from 'vitest'

import {
  assignmentConflicts,
  callTime,
  daysBetweenKeys,
  defaultArrival,
  defaultRehearsal,
  buildWeeklyRule,
  isEligible,
  isUnavailable,
  parseWeeklyRule,
  suggestSubstitutes,
  weeklyOccurrences,
  type EligibilityInfo,
  type MemberLike,
} from './schedule.ts'

const VIOLAO = 'role-violao'
const VOCAL = 'role-vocal'
const member = (
  id: string,
  name: string,
  roleIds: string[],
  status: 'active' | 'inactive' = 'active',
): MemberLike => ({
  id,
  name,
  roleIds,
  status,
})
const allEligible: EligibilityInfo = {
  hasClosedCycle: false,
  evaluated: new Set(),
  eligible: new Set(),
}

// Domingo 01/11/2026 19h (SP) = 22h UTC
const culto = { id: 'e1', starts_at: '2026-11-01T22:00:00Z', ends_at: '2026-11-02T00:00:00Z' }
const outroNoMesmoHorario = { id: 'e2', starts_at: '2026-11-01T23:00:00Z', ends_at: null }
const cultoSemanaSeguinte = { id: 'e3', starts_at: '2026-11-08T22:00:00Z', ends_at: null }

describe('recorrência', () => {
  it('gera ocorrências semanais no horário local', () => {
    const dates = weeklyOccurrences({
      firstDate: '2026-11-01',
      time: '19:00',
      untilDate: '2026-11-22',
    })
    expect(dates.map((d) => d.toISOString())).toEqual([
      '2026-11-01T22:00:00.000Z',
      '2026-11-08T22:00:00.000Z',
      '2026-11-15T22:00:00.000Z',
      '2026-11-22T22:00:00.000Z',
    ])
  })

  it('aceita intervalo quinzenal e limite', () => {
    expect(
      weeklyOccurrences({
        firstDate: '2026-11-01',
        time: '10:00',
        untilDate: '2027-12-31',
        intervalWeeks: 2,
        max: 3,
      }),
    ).toHaveLength(3)
  })
})

describe('indisponibilidade', () => {
  it('monta e lê a regra semanal', () => {
    expect(buildWeeklyRule([3, 0, 3])).toBe('FREQ=WEEKLY;BYDAY=SU,WE')
    expect(parseWeeklyRule('FREQ=WEEKLY;BYDAY=SU,WE')).toEqual([0, 3])
    expect(parseWeeklyRule(null)).toBeNull()
  })

  it('período avulso cobre o evento que cruza o intervalo', () => {
    const u = [
      {
        ministry_member_id: 'm1',
        starts_at: '2026-11-01T00:00:00Z',
        ends_at: '2026-11-02T03:00:00Z',
        recurrence_rule: null,
      },
    ]
    expect(isUnavailable('m1', culto, u)).toBe(true)
    expect(isUnavailable('m2', culto, u)).toBe(false)
    expect(isUnavailable('m1', cultoSemanaSeguinte, u)).toBe(false)
  })

  it('regra semanal vale o dia inteiro no fuso e respeita o período', () => {
    const domingos = [
      {
        ministry_member_id: 'm1',
        starts_at: '2026-11-01T03:00:00Z', // 01/11 00h SP
        ends_at: '2026-11-02T03:00:00Z', // até o fim de 01/11
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=SU',
      },
    ]
    expect(isUnavailable('m1', culto, domingos)).toBe(true)
    expect(isUnavailable('m1', cultoSemanaSeguinte, domingos)).toBe(false) // fora do período
    const todaQuarta = [
      { ...domingos[0]!, ends_at: '2027-01-01T03:00:00Z', recurrence_rule: 'FREQ=WEEKLY;BYDAY=WE' },
    ]
    expect(isUnavailable('m1', culto, todaQuarta)).toBe(false)
  })
})

describe('elegibilidade', () => {
  it('no primeiro ciclo todos são elegíveis', () => {
    expect(isEligible('m1', allEligible)).toBe(true)
  })

  it('depois do fechamento, só quem ficou elegível (e quem entrou depois)', () => {
    const info: EligibilityInfo = {
      hasClosedCycle: true,
      evaluated: new Set(['m1', 'm2']),
      eligible: new Set(['m1']),
    }
    expect(isEligible('m1', info)).toBe(true)
    expect(isEligible('m2', info)).toBe(false)
    expect(isEligible('novo', info)).toBe(true)
  })
})

describe('conflitos', () => {
  const ana = member('m1', 'Ana', [VOCAL])
  const base = {
    roleId: VOCAL,
    event: culto,
    events: [culto, outroNoMesmoHorario],
    assignments: [],
    unavailability: [],
    eligibility: allEligible,
  }

  it('sem conflito', () => {
    expect(assignmentConflicts({ ...base, member: ana })).toEqual([])
  })

  it('detecta choque de horário, falta de função, inativo e inelegível', () => {
    const kinds = assignmentConflicts({
      ...base,
      member: member('m1', 'Ana', [VIOLAO], 'inactive'),
      assignments: [{ event_id: 'e2', ministry_member_id: 'm1', ministry_role_id: VOCAL }],
      eligibility: { hasClosedCycle: true, evaluated: new Set(['m1']), eligible: new Set() },
    }).map((c) => c.kind)
    expect(kinds).toEqual(['inactive', 'ineligible', 'missing_role', 'double_booked'])
  })
})

describe('sugestão de substituto', () => {
  const members = [
    member('m1', 'Júlia', [VOCAL]),
    member('m2', 'Letícia', [VOCAL]),
    member('m3', 'Ana Clara', [VOCAL]),
    member('m4', 'Marcos', [VIOLAO]),
    member('m5', 'Bia', [VOCAL], 'inactive'),
  ]

  it('prefere quem foi menos escalado no mês, só com a função e disponível', () => {
    const result = suggestSubstitutes({
      roleId: VOCAL,
      event: culto,
      members,
      events: [culto, cultoSemanaSeguinte],
      assignments: [
        { event_id: 'e1', ministry_member_id: 'm1', ministry_role_id: VOCAL }, // Júlia já está no culto
        { event_id: 'e3', ministry_member_id: 'm3', ministry_role_id: VOCAL }, // Ana Clara 1x no mês
      ],
      unavailability: [],
      eligibility: allEligible,
      exclude: ['m1'],
    })
    expect(result.map((s) => s.member.name)).toEqual(['Letícia', 'Ana Clara'])
    expect(result[0]?.assignmentsInMonth).toBe(0)
  })

  it('não sugere indisponível nem inelegível', () => {
    const result = suggestSubstitutes({
      roleId: VOCAL,
      event: culto,
      members,
      events: [culto],
      assignments: [],
      unavailability: [
        {
          ministry_member_id: 'm2',
          starts_at: '2026-11-01T00:00:00Z',
          ends_at: '2026-11-03T00:00:00Z',
          recurrence_rule: null,
        },
      ],
      eligibility: {
        hasClosedCycle: true,
        evaluated: new Set(['m1', 'm3']),
        eligible: new Set(['m1']),
      },
    })
    expect(result.map((s) => s.member.name)).toEqual(['Júlia'])
  })
})

describe('respostas de disponibilidade', () => {
  const vocal = [member('m1', 'Ana', [VOCAL]), member('m2', 'Bia', [VOCAL])]
  const periodo = {
    ministry_member_id: 'm1',
    starts_at: '2026-11-01T00:00:00Z',
    ends_at: '2026-11-03T00:00:00Z',
    recurrence_rule: null,
  }
  const base = {
    roleId: VOCAL,
    event: culto,
    events: [culto],
    assignments: [],
    eligibility: allEligible,
  }

  it('sem resposta pode ser escalado; "não posso" vira conflito', () => {
    expect(assignmentConflicts({ ...base, member: vocal[0]!, unavailability: [] })).toEqual([])
    const conflicts = assignmentConflicts({
      ...base,
      member: vocal[0]!,
      unavailability: [],
      answers: [{ event_id: 'e1', ministry_member_id: 'm1', available: false }],
    })
    expect(conflicts.map((c) => c.kind)).toEqual(['unavailable'])
  })

  it('"posso" na data vale mais que um período de indisponibilidade', () => {
    expect(
      assignmentConflicts({
        ...base,
        member: vocal[0]!,
        unavailability: [periodo],
        answers: [{ event_id: 'e1', ministry_member_id: 'm1', available: true }],
      }),
    ).toEqual([])
  })

  it('sugere primeiro quem disse "posso"', () => {
    const result = suggestSubstitutes({
      ...base,
      members: vocal,
      unavailability: [],
      assignments: [{ event_id: 'e1', ministry_member_id: 'x', ministry_role_id: null }],
      answers: [{ event_id: 'e1', ministry_member_id: 'm2', available: true }],
    })
    expect(result.map((s) => [s.member.name, s.confirmed])).toEqual([
      ['Bia', true],
      ['Ana', false],
    ])
  })
})

describe('chegada e ensaio do culto', () => {
  it('chegada padrão: X minutos antes do culto', () => {
    expect(defaultArrival('19:00', 30)).toBe('18:30')
    expect(defaultArrival('09:15', 45)).toBe('08:30')
    expect(defaultArrival('19:00', 0)).toBe('19:00')
  })

  it('ensaio padrão: N dias antes, no horário configurado', () => {
    expect(
      defaultRehearsal('2026-11-01', { rehearsal_days_before: 3, rehearsal_time: '20:00:00' }),
    ).toEqual({ date: '2026-10-29', time: '20:00' })
    expect(daysBetweenKeys('2026-10-29', '2026-11-01')).toBe(3)
    // "toda quinta": culto no domingo 01/11 → quinta 29/10; culto na quarta 04/11 → quinta 29/10
    const quinta = {
      rehearsal_days_before: 3,
      rehearsal_time: '19:30',
      rehearsal_mode: 'weekday',
      rehearsal_weekday: 4,
    }
    expect(defaultRehearsal('2026-11-01', quinta).date).toBe('2026-10-29')
    expect(defaultRehearsal('2026-11-04', quinta).date).toBe('2026-10-29')
    expect(defaultRehearsal('2026-11-05', quinta).date).toBe('2026-11-05')
  })

  it('regras de horário usam a chegada quando existe', () => {
    expect(callTime({ starts_at: 'A', arrive_at: 'B' })).toBe('B')
    expect(callTime({ starts_at: 'A', arrive_at: null })).toBe('A')
  })
})
