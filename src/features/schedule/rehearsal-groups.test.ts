import { describe, expect, it } from 'vitest'

import {
  isVoiceRole,
  rehearsalSlots,
  rehearsalTitle,
  rolesWithoutRehearsal,
  splitBandAndVoices,
  type RehearsalGroup,
} from './rehearsal-groups'

const settings = {
  rehearsal_days_before: 3,
  rehearsal_time: '20:00:00',
  rehearsal_mode: 'days_before',
  rehearsal_weekday: null,
  rehearsal_duration_min: 120,
}

const group = (g: Partial<RehearsalGroup>): RehearsalGroup => ({
  id: 'g',
  name: 'Ensaio',
  sort_order: 0,
  role_ids: [],
  mode: 'days_before',
  days_before: 3,
  weekday: null,
  time: '20:00:00',
  duration_min: 120,
  ...g,
})

describe('rehearsalSlots', () => {
  it('sem grupos: um ensaio com a equipe toda, pelas Configurações', () => {
    expect(rehearsalSlots(settings, [])).toEqual([
      {
        groupId: null,
        name: 'Ensaio',
        defaults: {
          rehearsal_days_before: 3,
          rehearsal_time: '20:00:00',
          rehearsal_mode: 'days_before',
          rehearsal_weekday: null,
        },
        durationMin: 120,
      },
    ])
  })

  it('com grupos: um por grupo, na ordem, com o dia e horário de cada um', () => {
    const slots = rehearsalSlots(settings, [
      group({
        id: 'v',
        name: 'Ensaio de vozes',
        sort_order: 1,
        mode: 'weekday',
        weekday: 3,
        time: '19:30:00',
        duration_min: 90,
      }),
      group({ id: 'b', name: 'Ensaio da banda', sort_order: 0 }),
    ])
    expect(slots.map((s) => s.groupId)).toEqual(['b', 'v'])
    expect(slots[1]).toMatchObject({
      name: 'Ensaio de vozes',
      defaults: { rehearsal_mode: 'weekday', rehearsal_weekday: 3, rehearsal_time: '19:30:00' },
      durationMin: 90,
    })
  })
})

describe('banda e vozes', () => {
  it('reconhece funções de voz', () => {
    for (const n of ['Vocal', 'Back vocal', 'Ministro', 'Voz principal', 'Cantor', 'Soprano'])
      expect(isVoiceRole(n)).toBe(true)
    for (const n of ['Baixo', 'Bateria', 'Teclado', 'Guitarra', 'Violão', 'Som'])
      expect(isVoiceRole(n)).toBe(false)
  })

  it('divide as funções e acha as que não ensaiam', () => {
    const roles = [
      { id: '1', name: 'Baixo' },
      { id: '2', name: 'Vocal' },
      { id: '3', name: 'Som' },
    ]
    expect(splitBandAndVoices(roles)).toEqual({ band: ['1', '3'], voices: ['2'] })
    expect(rolesWithoutRehearsal(roles, [{ role_ids: ['1'] }, { role_ids: ['2'] }])).toEqual([
      { id: '3', name: 'Som' },
    ])
    expect(rolesWithoutRehearsal(roles, [])).toEqual([])
  })

  it('nome do ensaio', () => {
    expect(rehearsalTitle(null, 'Culto de Domingo')).toBe('Ensaio · Culto de Domingo')
    expect(rehearsalTitle('Ensaio de vozes', 'Culto de Domingo')).toBe(
      'Ensaio de vozes · Culto de Domingo',
    )
  })
})
