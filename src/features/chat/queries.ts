import { useEffect, useMemo } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'

import { mergeMessages, sortConversations, type ChatMessage } from '@/features/chat/chat'
import { supabase } from '@/lib/supabase'

export const chatKeys = {
  list: (churchId: string) => ['chat', 'list', churchId] as const,
  messages: (conversationId: string) => ['chat', 'messages', conversationId] as const,
  people: (churchId: string) => ['chat', 'people', churchId] as const,
  ofEvent: (eventId: string) => ['chat', 'event', eventId] as const,
}

const PAGE = 50

/** Conversas da pessoa nesta igreja (grupo, cultos da semana, diretas). */
export function useConversations(churchId: string) {
  return useQuery({
    queryKey: chatKeys.list(churchId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_conversations', { p_church_id: churchId })
      if (error) throw error
      return sortConversations(data)
    },
  })
}

export type ConversationListRow = NonNullable<ReturnType<typeof useConversations>['data']>[number]

/** Pessoas da igreja (nomes nas mensagens e "Nova conversa"). */
export function useChurchPeople(churchId: string) {
  return useQuery({
    queryKey: chatKeys.people(churchId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('church_members')
        .select('user_id, profiles(full_name)')
        .eq('church_id', churchId)
      if (error) throw error
      return data
        .map((m) => ({ id: m.user_id, name: m.profiles?.full_name?.trim() || 'Sem nome' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    },
  })
}

/** Nome por perfil (objeto simples). */
export function usePeopleNames(churchId: string) {
  const people = useChurchPeople(churchId)
  return useMemo(
    () =>
      Object.fromEntries((people.data ?? []).map((p) => [p.id, p.name])) as Record<string, string>,
    [people.data],
  )
}

type Pages = InfiniteData<ChatMessage[], string | null>

/** Mensagens da conversa, das mais novas para trás (páginas de 50). */
export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from('chat_messages')
        .select('id, conversation_id, church_id, sender_id, body, created_at, deleted_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (pageParam) query = query.lt('created_at', pageParam)
      const { data, error } = await query
      if (error) throw error
      return data as ChatMessage[]
    },
    getNextPageParam: (last) =>
      last.length < PAGE ? null : (last[last.length - 1]?.created_at ?? null),
  })
}

/** Lista única em ordem de envio, a partir das páginas. */
export function flattenPages(
  data: InfiniteData<ChatMessage[], unknown> | undefined,
): ChatMessage[] {
  return mergeMessages([], (data?.pages ?? []).flat())
}

/** Coloca/atualiza uma mensagem no cache da conversa (envio e Realtime). */
export function upsertMessageInCache(client: QueryClient, message: ChatMessage) {
  client.setQueryData<Pages>(chatKeys.messages(message.conversation_id), (data) => {
    if (!data) return data
    const exists = data.pages.some((p) => p.some((m) => m.id === message.id))
    const pages = exists
      ? data.pages.map((p) => p.map((m) => (m.id === message.id ? { ...m, ...message } : m)))
      : [[message, ...(data.pages[0] ?? [])], ...data.pages.slice(1)]
    return { ...data, pages }
  })
}

export function removeMessageFromCache(client: QueryClient, conversationId: string, id: string) {
  client.setQueryData<Pages>(chatKeys.messages(conversationId), (data) =>
    data ? { ...data, pages: data.pages.map((p) => p.filter((m) => m.id !== id)) } : data,
  )
}

/**
 * Realtime das mensagens da igreja (o RLS só entrega as conversas da pessoa):
 * atualiza a conversa aberta e a lista/selo de não lidas. Fica no AppLayout.
 */
export function useChatRealtime(churchId: string) {
  const client = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`chat-messages:${churchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `church_id=eq.${churchId}`,
        },
        (payload) => {
          const message = payload.new as ChatMessage | undefined
          if (message?.id) upsertMessageInCache(client, { ...message, pending: false })
          void client.invalidateQueries({ queryKey: chatKeys.list(churchId) })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [churchId, client])
}

/** Conversa da equipe de um culto (para o ensaio, a do culto). */
export function useEventConversation(eventId: string | undefined) {
  return useQuery({
    queryKey: chatKeys.ofEvent(eventId ?? ''),
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('event_id', eventId ?? '')
        .maybeSingle()
      if (error) throw error
      return data?.id ?? null
    },
  })
}
