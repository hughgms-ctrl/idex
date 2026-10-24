import { describe, expect, it } from 'vitest'

import { fillTemplate, whenLabel } from './templates'

const ensaio = {
  title: 'Ensaio · Culto de domingo',
  kind: 'rehearsal',
  starts_at: '2026-10-30T23:00:00Z', // sexta 20h em São Paulo
  arrive_at: '2026-10-30T22:40:00Z',
}

describe('modelos de aviso', () => {
  it('escreve a data no fuso da igreja', () => {
    expect(whenLabel('2026-10-25T21:30:00Z')).toBe('domingo, 25/10 às 18h30')
  })

  it('lembrete de ensaio traz dia, hora e chegada', () => {
    expect(fillTemplate('rehearsal', ensaio)?.body).toBe(
      'Ensaio sexta, 30/10 às 20h. Chegada da equipe: 19h40. Venham com as músicas estudadas e cheguem no horário. Bata o ponto pelo app.',
    )
  })

  it('sem chegada diferente não repete o horário', () => {
    const r = fillTemplate('service', { ...ensaio, title: 'Culto', arrive_at: null })
    expect(r?.title).toBe('Lembrete: Culto')
    expect(r?.body).not.toContain('Chegada')
  })

  it('personalizado ou sem evento não preenche nada', () => {
    expect(fillTemplate('custom', ensaio)).toBeNull()
    expect(fillTemplate('rehearsal', null)).toBeNull()
  })
})
