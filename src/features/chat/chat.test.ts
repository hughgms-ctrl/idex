import { describe, expect, it } from 'vitest'

import {
  conversationTime,
  dayLabel,
  mergeMessages,
  previewText,
  sortConversations,
  splitLinks,
  threadItems,
  splitArchived,
  totalUnread,
  typingText,
  unreadLabel,
  type ChatMessage,
  type ConversationRow,
} from '@/features/chat/chat'

// 25/10/2026 (domingo) 20:00 em São Paulo = 23:00 UTC
const NOW = new Date('2026-10-25T23:00:00Z')

const msg = (id: string, sender: string, at: string, extra: Partial<ChatMessage> = {}) =>
  ({
    id,
    conversation_id: 'c',
    church_id: 'ch',
    sender_id: sender,
    body: id,
    created_at: at,
    deleted_at: null,
    ...extra,
  }) satisfies ChatMessage

const row = (extra: Partial<ConversationRow>): ConversationRow => ({
  id: 'x',
  kind: 'ministry',
  title: 'Louvor',
  archived: false,
  muted: false,
  unread: 0,
  last_message_at: null,
  event_starts_at: null,
  last_body: null,
  last_sender_id: null,
  last_sender_name: 'Sem nome',
  last_deleted: false,
  ...extra,
})

describe('conversationTime', () => {
  it('hoje mostra a hora de São Paulo', () => {
    expect(conversationTime('2026-10-25T22:24:00Z', NOW)).toBe('19:24')
  })
  it('perto da meia-noite usa o dia de São Paulo, não o UTC', () => {
    // 24/10 23:30 em SP = 25/10 02:30 UTC → ontem
    expect(conversationTime('2026-10-25T02:30:00Z', NOW)).toBe('ontem')
  })
  it('na semana mostra o dia; antes, a data', () => {
    expect(conversationTime('2026-10-21T15:00:00Z', NOW)).toBe('qua')
    expect(conversationTime('2026-10-12T15:00:00Z', NOW)).toBe('12/10')
  })
})

describe('dayLabel', () => {
  it('hoje, ontem e dia da semana por extenso', () => {
    expect(dayLabel('2026-10-25T12:00:00Z', NOW)).toBe('Hoje')
    expect(dayLabel('2026-10-24T12:00:00Z', NOW)).toBe('Ontem')
    expect(dayLabel('2026-10-19T12:00:00Z', NOW)).toBe('Segunda-feira, 19 out')
  })
  it('ano só quando é outro', () => {
    expect(dayLabel('2025-12-31T12:00:00Z', NOW)).toBe('Quarta-feira, 31 dez 2025')
  })
})

describe('threadItems', () => {
  it('separa por dia e agrupa a mesma pessoa em até 5 min', () => {
    const items = threadItems(
      [
        msg('a', 'ana', '2026-10-24T22:00:00Z'),
        msg('b', 'ana', '2026-10-25T12:00:00Z'),
        msg('c', 'ana', '2026-10-25T12:04:00Z'),
        msg('d', 'eu', '2026-10-25T12:05:00Z'),
        msg('e', 'eu', '2026-10-25T12:11:00Z'),
      ],
      'eu',
      NOW,
    )
    expect(
      items.map((i) => (i.type === 'day' ? i.label : `${i.key}${i.first ? '*' : ''}`)),
    ).toEqual(['Ontem', 'a*', 'Hoje', 'b*', 'c', 'd*', 'e*'])
    const d = items.find((i) => i.key === 'd')
    expect(d?.type === 'message' && d.mine).toBe(true)
  })
})

describe('mergeMessages', () => {
  it('não repete, aplica a versão nova e ordena', () => {
    const merged = mergeMessages(
      [
        msg('b', 'ana', '2026-10-25T12:01:00Z'),
        msg('a', 'ana', '2026-10-25T12:00:00Z', { pending: true }),
      ],
      [msg('a', 'ana', '2026-10-25T12:00:02Z', { pending: false, deleted_at: 'x', body: '' })],
    )
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
    expect(merged[0]).toMatchObject({ pending: false, deleted_at: 'x', body: '' })
  })
})

describe('typingText', () => {
  it('um, dois ou vários', () => {
    expect(typingText([])).toBeNull()
    expect(typingText(['Ana Lima'])).toBe('Ana está digitando…')
    expect(typingText(['Ana Lima', 'Beto'])).toBe('Ana e Beto estão digitando…')
    expect(typingText(['A', 'B', 'C'])).toBe('3 pessoas estão digitando…')
  })
})

describe('lista de conversas', () => {
  it('prévia da última mensagem', () => {
    expect(previewText(row({}), 'eu')).toBe('Nenhuma mensagem ainda')
    expect(previewText(row({ kind: 'event' }), 'eu')).toBe('Conversa da equipe escalada')
    const last = { last_message_at: 'x', last_body: 'Oi', last_sender_name: 'Ana Lima' }
    expect(previewText(row({ ...last, last_sender_id: 'ana' }), 'eu')).toBe('Ana: Oi')
    expect(previewText(row({ ...last, last_sender_id: 'eu' }), 'eu')).toBe('Você: Oi')
    expect(previewText(row({ ...last, kind: 'direct', last_sender_id: 'ana' }), 'eu')).toBe('Oi')
    expect(previewText(row({ ...last, last_deleted: true }), 'eu')).toBe('Mensagem apagada')
  })

  it('grupo primeiro, depois a mais recente, depois o culto mais próximo', () => {
    const sorted = sortConversations([
      row({
        id: 'culto-longe',
        kind: 'event',
        title: 'B',
        event_starts_at: '2026-10-30T22:00:00Z',
      }),
      row({ id: 'direta', kind: 'direct', last_message_at: '2026-10-25T10:00:00Z' }),
      row({
        id: 'culto-perto',
        kind: 'event',
        title: 'A',
        event_starts_at: '2026-10-26T22:00:00Z',
      }),
      row({ id: 'grupo', kind: 'ministry' }),
      row({ id: 'nova', kind: 'direct', last_message_at: '2026-10-25T11:00:00Z' }),
    ])
    expect(sorted.map((r) => r.id)).toEqual([
      'grupo',
      'nova',
      'direta',
      'culto-perto',
      'culto-longe',
    ])
  })

  it('selo do menu não conta silenciadas nem arquivadas', () => {
    expect(
      totalUnread([
        row({ unread: 3 }),
        row({ unread: 5, muted: true }),
        row({ unread: 2, archived: true }),
        row({ unread: 4, user_archived: true }),
        row({ unread: 1 }),
      ]),
    ).toBe(4)
    expect(unreadLabel(7)).toBe('7')
    expect(unreadLabel(99)).toBe('99+')
  })

  it('arquivadas: culto que já passou ou arquivada pela pessoa', () => {
    const a = row({ id: 'a' })
    const b = row({ id: 'b', archived: true })
    const c = row({ id: 'c', user_archived: true })
    expect(splitArchived([a, b, c])).toEqual({ active: [a], archived: [b, c] })
  })
})

describe('splitLinks', () => {
  it('links viram clicáveis, sem a pontuação do fim', () => {
    expect(splitLinks('Ouçam https://youtu.be/abc, e www.cifraclub.com.br.')).toEqual([
      { text: 'Ouçam ' },
      { text: 'https://youtu.be/abc', href: 'https://youtu.be/abc' },
      { text: ', e ' },
      { text: 'www.cifraclub.com.br', href: 'https://www.cifraclub.com.br' },
      { text: '.' },
    ])
    expect(splitLinks('sem link')).toEqual([{ text: 'sem link' }])
  })
})
