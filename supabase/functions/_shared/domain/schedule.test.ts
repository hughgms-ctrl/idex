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
  presenceState,
  parseWeeklyRule,
  suggestSubstitutes,
  weeklyOccurrences,
  type EligibilityInfo,
  type MemberLike,
  extendWeeklySeries,
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

describe('extendWeeklySeries', () => {
  // último culto: domingo 17/01/2027 19h (SP), chegada 18h30, som 18h45; ensaio qui 14/01 20h, chegada 19h40
  const last = {
    starts_at: '2027-01-17T22:00:00.000Z',
    ends_at: '2027-01-18T00:00:00.000Z',
    arrive_at: '2027-01-17T21:30:00.000Z',
    soundcheck_at: '2027-01-17T21:45:00.000Z',
  }
  const lastRehearsal = {
    starts_at: '2027-01-14T23:00:00.000Z',
    ends_at: '2027-01-15T01:00:00.000Z',
    arrive_at: '2027-01-14T22:40:00.000Z',
  }

  // ensaio de vozes: sábado 16/01 9h, sem chegada nem duração
  const voices = { starts_at: '2027-01-16T12:00:00.000Z', ends_at: null, arrive_at: null }

  it('completa os domingos até o fim do trimestre com os mesmos horários e os ensaios', () => {
    const next = extendWeeklySeries({
      last,
      lastRehearsals: [lastRehearsal, voices],
      untilKey: '2027-03-31',
    })
    expect(next).toHaveLength(10)
    expect(next[0]).toEqual({
      starts_at: '2027-01-24T22:00:00.000Z',
      ends_at: '2027-01-25T00:00:00.000Z',
      arrive_at: '2027-01-24T21:30:00.000Z',
      soundcheck_at: '2027-01-24T21:45:00.000Z',
      rehearsals: [
        {
          starts_at: '2027-01-21T23:00:00.000Z',
          ends_at: '2027-01-22T01:00:00.000Z',
          arrive_at: '2027-01-21T22:40:00.000Z',
        },
        { starts_at: '2027-01-23T12:00:00.000Z', ends_at: null, arrive_at: null },
      ],
    })
    expect(next.at(-1)?.starts_at).toBe('2027-03-28T22:00:00.000Z')
  })

  it('sem ensaio no último culto, não cria ensaio; nada a completar devolve vazio', () => {
    const next = extendWeeklySeries({ last, untilKey: '2027-01-31' })
    expect(next.map((n) => n.starts_at)).toEqual([
      '2027-01-24T22:00:00.000Z',
      '2027-01-31T22:00:00.000Z',
    ])
    expect(next[0]?.rehearsals).toEqual([])
    expect(extendWeeklySeries({ last, untilKey: '2027-01-23' })).toEqual([])
  })
})

describe('presenceState', () => {
  // Quinta 29/10/2026: ensaio 19h35, chegada 19h10 (São Paulo = UTC−3)
  const rehearsal = {
    id: 'r',
    starts_at: '2026-10-29T22:35:00Z',
    arrive_at: '2026-10-29T22:10:00Z',
    ends_at: '2026-10-30T00:30:00Z',
  }
  // Domingo 01/11: culto 18h, chegada 16h40, sem fim definido (2 h)
  const service = {
    id: 's',
    starts_at: '2026-11-01T21:00:00Z',
    arrive_at: '2026-11-01T19:40:00Z',
    ends_at: null,
  }

  it('dias antes: só o próximo compromisso', () => {
    expect(presenceState([service, rehearsal], '2026-10-25T15:00:00Z')).toMatchObject({
      kind: 'upcoming',
      event: { id: 'r' },
    })
  })
  it('no dia, antes de abrir: abre 2 h antes da chegada', () => {
    const s = presenceState([rehearsal, service], '2026-10-29T12:00:00Z')
    expect(s.kind).toBe('later_today')
    if (s.kind === 'later_today') expect(s.opensAt.toISOString()).toBe('2026-10-29T20:10:00.000Z')
  })
  it('janela aberta até o fim do evento', () => {
    expect(presenceState([rehearsal], '2026-10-29T20:10:00Z').kind).toBe('open')
    expect(presenceState([rehearsal], '2026-10-30T00:30:00Z').kind).toBe('open')
    expect(presenceState([rehearsal], '2026-10-30T00:31:00Z').kind).toBe('none')
  })
  it('sem fim definido, fecha 2 h depois do início', () => {
    expect(presenceState([service], '2026-11-01T22:59:00Z').kind).toBe('open')
    expect(presenceState([service], '2026-11-01T23:01:00Z').kind).toBe('none')
  })
  it('evento das 23h30 no dia seguinte não conta como "hoje"', () => {
    const late = { id: 'x', starts_at: '2026-10-30T02:30:00Z', arrive_at: null, ends_at: null }
    // 29/10 12h em SP; o evento é 29/10 23h30 em SP → hoje
    expect(presenceState([late], '2026-10-29T15:00:00Z').kind).toBe('later_today')
    // 28/10 em SP → amanhã
    expect(presenceState([late], '2026-10-28T15:00:00Z').kind).toBe('upcoming')
  })
})
