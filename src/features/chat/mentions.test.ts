import { describe, expect, it } from 'vitest'

import { fitWithin } from './images'
import {
  collectMentions,
  filterPeople,
  insertMention,
  matchesAll,
  mentionQuery,
  splitMentions,
} from './mentions'

const people = [
  { id: 'a', name: 'Ana Paula Souza' },
  { id: 'b', name: 'João Silva' },
  { id: 'c', name: 'Ângela Costa' },
]

describe('mentionQuery', () => {
  it('acha o @ antes do cursor (começo ou depois de espaço)', () => {
    expect(mentionQuery('@Jo', 3)).toEqual({ start: 0, query: 'Jo' })
    expect(mentionQuery('oi @', 4)).toEqual({ start: 3, query: '' })
    expect(mentionQuery('oi @an tudo', 6)).toEqual({ start: 3, query: 'an' })
  })
  it('ignora e-mail e @ já fechado com espaço', () => {
    expect(mentionQuery('a@b', 3)).toBeNull()
    expect(mentionQuery('@Jo ', 4)).toBeNull()
  })
})

describe('filterPeople', () => {
  it('combina com o começo de qualquer palavra, sem acento', () => {
    expect(filterPeople(people, 'sil').map((p) => p.id)).toEqual(['b'])
    expect(filterPeople(people, 'ange').map((p) => p.id)).toEqual(['c'])
    expect(filterPeople(people, 'joao').map((p) => p.id)).toEqual(['b'])
    expect(filterPeople(people, '').length).toBe(3)
  })
  it('@all combina com all e todos', () => {
    expect(matchesAll('')).toBe(true)
    expect(matchesAll('al')).toBe(true)
    expect(matchesAll('tod')).toBe(true)
    expect(matchesAll('jo')).toBe(false)
  })
})

describe('insertMention', () => {
  it('troca o que foi digitado pelo nome e põe o cursor depois', () => {
    expect(insertMention('oi @jo', 3, 6, 'João Silva')).toEqual({
      text: 'oi @João Silva ',
      caret: 15,
    })
    expect(insertMention('@an tudo bem', 0, 3, 'Ana Paula Souza')).toEqual({
      text: '@Ana Paula Souza tudo bem',
      caret: 17,
    })
  })
})

describe('collectMentions', () => {
  const picked = [
    { id: 'a', label: 'Ana Paula Souza' },
    { id: 'b', label: 'João Silva' },
  ]
  it('só quem continua no texto', () => {
    expect(collectMentions('@João Silva, chega às 19h', picked)).toEqual({
      mentions: ['b'],
      mentionAll: false,
    })
  })
  it('@all e @todos citam todos', () => {
    expect(collectMentions('@all ensaio hoje', []).mentionAll).toBe(true)
    expect(collectMentions('Atenção @todos!', []).mentionAll).toBe(true)
    expect(collectMentions('email@all.com', []).mentionAll).toBe(false)
  })
})

describe('splitMentions', () => {
  const labels = [
    { id: 'a', label: 'Ana Paula Souza' },
    { id: 'b', label: 'João Silva' },
  ]
  it('destaca quem foi citado (eu ou outro)', () => {
    expect(splitMentions('@João Silva e @Ana Paula Souza, oi', labels, 'a', false)).toEqual([
      { text: '@João Silva', mention: 'other' },
      { text: ' e ' },
      { text: '@Ana Paula Souza', mention: 'me' },
      { text: ', oi' },
    ])
  })
  it('@all só quando a mensagem citou todos', () => {
    expect(splitMentions('@all bora', [], 'x', true)).toEqual([
      { text: '@all', mention: 'all' },
      { text: ' bora' },
    ])
    expect(splitMentions('@all bora', [], 'x', false)).toEqual([{ text: '@all bora' }])
  })
})

describe('fitWithin', () => {
  it('reduz pelo lado maior, sem aumentar', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(1080, 1920)).toEqual({ width: 900, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})
