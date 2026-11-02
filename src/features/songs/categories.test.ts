import { describe, expect, it } from 'vitest'

import { describeSlots, parseSlots } from './categories'

describe('estrutura do culto salva', () => {
  it('lê só partes válidas', () => {
    expect(
      parseSlots([
        { categoryId: 'a', count: 2 },
        { categoryId: 'b', count: 0 },
        { categoryId: 3, count: 1 },
        { categoryId: 'c', count: 11 },
        { categoryId: 'd', count: 1 },
      ]),
    ).toEqual([
      { categoryId: 'a', count: 2 },
      { categoryId: 'd', count: 1 },
    ])
    expect(parseSlots(null)).toEqual([])
  })
  it('descarta tipos que não existem mais', () => {
    expect(parseSlots([{ categoryId: 'a', count: 1 }], ['b'])).toEqual([])
  })
  it('descreve em ordem', () => {
    const names: Record<string, string> = { a: 'Celebração', b: 'Adoração' }
    expect(
      describeSlots(
        [
          { categoryId: 'a', count: 2 },
          { categoryId: 'b', count: 3 },
        ],
        (id) => names[id],
      ),
    ).toBe('2 Celebração → 3 Adoração')
  })
})
