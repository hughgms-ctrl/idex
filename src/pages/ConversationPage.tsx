import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowLeft, Bell, BellOff, SendHorizontal, Trash2 } from 'lucide-react'

import { useUser } from '@/auth/auth-context'
import { ErrorState } from '@/components/ErrorState'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import {
  messageTime,
  splitLinks,
  threadItems,
  typingText,
  type ChatMessage,
} from '@/features/chat/chat'
import {
  chatKeys,
  flattenPages,
  removeMessageFromCache,
  upsertMessageInCache,
  useMessages,
  usePeopleNames,
} from '@/features/chat/queries'
import { useTyping } from '@/features/chat/useTyping'
import { useMyProfile } from '@/features/profile/queries'
import { ConversationAvatar } from '@/pages/ConversationsPage'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const READ_EVERY_MS = 30_000 // com a conversa aberta, avisa o servidor (não manda push)

function useConversationInfo(conversationId: string) {
  return useQuery({
    queryKey: ['chat', 'info', conversationId] as const,
    queryFn: async () => {
      const [conv, read] = await Promise.all([
        supabase
          .from('chat_conversations')
          .select(
            'id, kind, ministry_id, event_id, ministries(name), events(title, starts_at, ends_at), chat_participants(profile_id)',
          )
          .eq('id', conversationId)
          .maybeSingle(),
        supabase
          .from('chat_reads')
          .select('muted')
          .eq('conversation_id', conversationId)
          .maybeSingle(),
      ])
      if (conv.error) throw conv.error
      if (read.error) throw read.error
      return conv.data ? { ...conv.data, muted: read.data?.muted ?? false } : null
    },
  })
}

export function ConversationPage() {
  const { conversationId = '' } = useParams()
  const user = useUser()
  const profile = useMyProfile()
  const { church, isLeader } = useChurch()
  const queryClient = useQueryClient()
  const info = useConversationInfo(conversationId)
  const messages = useMessages(conversationId)
  const names = usePeopleNames(church.id)
  const me = useMemo(
    () => ({ id: user.id, name: profile.data?.full_name || 'Alguém' }),
    [user.id, profile.data?.full_name],
  )
  const typing = useTyping(conversationId, me)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [newBelow, setNewBelow] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const list = useMemo(() => flattenPages(messages.data), [messages.data])
  const items = useMemo(() => threadItems(list, user.id), [list, user.id])
  const conv = info.data
  const ministryName = conv?.ministries?.name
  const event = conv?.events
  const otherId = conv?.chat_participants.find((p) => p.profile_id !== user.id)?.profile_id
  const title =
    conv?.kind === 'ministry'
      ? (ministryName ?? 'Grupo')
      : conv?.kind === 'event'
        ? (event?.title ?? 'Culto')
        : ((otherId && names[otherId]) ?? 'Conversa')
  const subtitle =
    conv?.kind === 'ministry'
      ? 'Grupo do ministério'
      : conv?.kind === 'event' && event
        ? `Equipe · ${formatEventDate(event.starts_at)}`
        : 'Conversa direta'
  const eventEnd = event
    ? Date.parse(event.ends_at ?? event.starts_at) + (event.ends_at ? 0 : 3 * 3_600_000)
    : null
  const [now] = useState(() => Date.now())
  const archived = conv?.kind === 'event' && eventEnd !== null && eventEnd + 86_400_000 < now
  const canModerate = Boolean(conv?.ministry_id && isLeader(conv.ministry_id))

  // ---- lido ----
  const markRead = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    })
    if (!error) void queryClient.invalidateQueries({ queryKey: chatKeys.list(church.id) })
  }, [conversationId, church.id, queryClient])

  const lastId = list[list.length - 1]?.id
  useEffect(() => {
    void markRead()
  }, [markRead, lastId])
  useEffect(() => {
    const timer = window.setInterval(() => void markRead(), READ_EVERY_MS)
    const onVisible = () => void markRead()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [markRead])

  // quem mandou a mensagem já não está digitando
  const lastSender = list[list.length - 1]?.sender_id ?? null
  const { clearTypist } = typing
  useEffect(() => clearTypist(lastSender), [clearTypist, lastSender, lastId])

  // ---- rolagem: começa embaixo; mantém o lugar ao carregar mensagens antigas ----
  const firstId = list[0]?.id
  const prev = useRef<{ first?: string; last?: string; height: number }>({ height: 0 })
  const atBottom = useRef(true)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const before = prev.current
    if (!before.last) {
      el.scrollTop = el.scrollHeight
    } else if (firstId !== before.first && lastId === before.last) {
      el.scrollTop += el.scrollHeight - before.height // carregou as antigas em cima
    } else if (lastId !== before.last) {
      const mine = list[list.length - 1]?.sender_id === user.id
      if (mine || atBottom.current) el.scrollTop = el.scrollHeight
      else setNewBelow(true)
    }
    prev.current = { first: firstId, last: lastId, height: el.scrollHeight }
  }, [firstId, lastId, list, user.id])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (atBottom.current) setNewBelow(false)
  }
  const toBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setNewBelow(false)
  }

  // ---- enviar / apagar / silenciar ----
  const send = useMutation({
    mutationFn: async (message: ChatMessage) => {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          id: message.id,
          church_id: message.church_id,
          conversation_id: message.conversation_id,
          body: message.body,
        })
        .select('id, conversation_id, church_id, sender_id, body, created_at, deleted_at')
        .single()
      if (error) throw error
      return data as ChatMessage
    },
    onMutate: (message) => upsertMessageInCache(queryClient, message),
    onSuccess: (saved) => {
      upsertMessageInCache(queryClient, { ...saved, pending: false })
      void queryClient.invalidateQueries({ queryKey: chatKeys.list(church.id) })
    },
    onError: (err, message) => {
      removeMessageFromCache(queryClient, conversationId, message.id)
      setText((t) => t || message.body)
      toast.error(errorMessage(err, 'Não foi possível enviar a mensagem.'))
    },
  })

  const submit = () => {
    const body = text.trim()
    if (!body || send.isPending) return
    send.mutate({
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      church_id: church.id,
      sender_id: user.id,
      body,
      created_at: new Date().toISOString(),
      deleted_at: null,
      pending: true,
    })
    setText('')
    typing.notifyStopped()
    inputRef.current?.focus()
  }

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_chat_message', { p_message_id: id })
      if (error) throw error
      return id
    },
    onSuccess: (id) => {
      const m = list.find((x) => x.id === id)
      if (m)
        upsertMessageInCache(queryClient, { ...m, body: '', deleted_at: new Date().toISOString() })
      setSelected(null)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const mute = useMutation({
    mutationFn: async (muted: boolean) => {
      const { error } = await supabase.rpc('set_conversation_muted', {
        p_conversation_id: conversationId,
        p_muted: muted,
      })
      if (error) throw error
      return muted
    },
    onSuccess: async (muted) => {
      await queryClient.invalidateQueries({ queryKey: ['chat', 'info', conversationId] })
      void queryClient.invalidateQueries({ queryKey: chatKeys.list(church.id) })
      toast.success(muted ? 'Conversa silenciada: sem avisos no celular.' : 'Avisos ligados.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  // textarea cresce até ~5 linhas
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const typingLine = typingText(typing.typingNames)

  if (info.error) return <ErrorState error={info.error} onRetry={() => void info.refetch()} />
  if (!info.isPending && !conv) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm">Conversa não encontrada ou você não participa dela.</p>
        <Button asChild variant="outline" className="w-fit">
          <Link to="/conversas">Voltar para as conversas</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Cabeçalho */}
      <header className="bg-nav flex items-center gap-2 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:rounded-t-2xl md:border md:px-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar para as conversas">
          <Link to="/conversas">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <ConversationAvatar kind={conv?.kind ?? 'ministry'} title={title} className="size-10" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{info.isPending ? '…' : title}</span>
          <span
            className={cn(
              'truncate text-xs',
              typingLine ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {typingLine ?? subtitle}
          </span>
        </div>
        {conv && (
          <Button
            variant="ghost"
            size="icon"
            disabled={mute.isPending}
            onClick={() => mute.mutate(!conv.muted)}
            aria-label={conv.muted ? 'Ligar avisos desta conversa' : 'Silenciar esta conversa'}
            title={conv.muted ? 'Ligar avisos' : 'Silenciar'}
          >
            {conv.muted ? <BellOff className="size-5" /> : <Bell className="size-5" />}
          </Button>
        )}
      </header>

      {/* Mensagens */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex h-full flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3 md:border-x"
          aria-live="polite"
        >
          {/* poucas mensagens ficam embaixo, perto de onde se escreve */}
          <div className="flex-1" aria-hidden="true" />
          {messages.hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground mx-auto"
              disabled={messages.isFetchingNextPage}
              onClick={() => void messages.fetchNextPage()}
            >
              {messages.isFetchingNextPage ? 'Carregando…' : 'Ver mensagens anteriores'}
            </Button>
          )}
          {messages.isPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            </div>
          )}
          {messages.error && (
            <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
          )}
          {!messages.isPending && list.length === 0 && (
            <p className="text-muted-foreground mx-auto my-6 max-w-xs text-center text-sm">
              {conv?.kind === 'event'
                ? 'Conversa da equipe escalada neste culto. Combinem repertório, carona, figurino…'
                : 'Nenhuma mensagem ainda. Diga oi!'}
            </p>
          )}
          {items.map((item) =>
            item.type === 'day' ? (
              <div key={item.key} className="my-2 flex justify-center">
                <span className="bg-secondary text-muted-foreground rounded-full px-3 py-1 text-xs font-medium">
                  {item.label}
                </span>
              </div>
            ) : (
              <MessageBubble
                key={item.key}
                message={item.message}
                mine={item.mine}
                first={item.first}
                senderName={
                  item.message.sender_id
                    ? (names[item.message.sender_id] ?? 'Alguém')
                    : 'Ex-integrante'
                }
                showName={conv?.kind !== 'direct'}
                selected={selected === item.message.id}
                canDelete={
                  !item.message.deleted_at &&
                  !item.message.pending &&
                  (item.mine || (canModerate && conv?.kind !== 'direct'))
                }
                deleting={remove.isPending}
                onSelect={() =>
                  setSelected((s) => (s === item.message.id ? null : item.message.id))
                }
                onDelete={() => remove.mutate(item.message.id)}
              />
            ),
          )}
        </div>
        {newBelow && (
          <button
            type="button"
            onClick={toBottom}
            className="bg-primary text-primary-foreground absolute bottom-3 left-1/2 flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-lg"
          >
            <ArrowDown className="size-4" aria-hidden="true" /> Novas mensagens
          </button>
        )}
      </div>

      {/* Escrever */}
      <div className="bg-nav border-t px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:mb-6 md:rounded-b-2xl md:border">
        {archived ? (
          <p className="text-muted-foreground py-2 text-center text-[13px]">
            O culto já passou: esta conversa ficou arquivada (só leitura) e some 30 dias depois.
          </p>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              maxLength={2000}
              placeholder="Mensagem"
              aria-label="Mensagem"
              enterKeyHint={coarse ? 'enter' : 'send'}
              onChange={(e) => {
                setText(e.target.value)
                if (e.target.value.trim()) typing.notifyTyping()
                else typing.notifyStopped()
              }}
              onBlur={typing.notifyStopped}
              onKeyDown={(e) => {
                // no computador Enter envia (Shift+Enter quebra a linha); no celular Enter quebra
                if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              className="bg-input/30 placeholder:text-muted-foreground focus-visible:ring-ring/50 max-h-[132px] min-h-11 flex-1 resize-none rounded-2xl border px-4 py-2.5 text-[15px] leading-snug outline-none focus-visible:ring-[3px]"
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={!text.trim()}
              aria-label="Enviar"
            >
              <SendHorizontal className="size-5" />
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  mine,
  first,
  senderName,
  showName,
  selected,
  canDelete,
  deleting,
  onSelect,
  onDelete,
}: {
  message: ChatMessage
  mine: boolean
  first: boolean
  senderName: string
  showName: boolean
  selected: boolean
  canDelete: boolean
  deleting: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const deleted = Boolean(message.deleted_at)
  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start', first && 'mt-2')}>
      {first && showName && !mine && (
        <span className="text-primary mb-0.5 px-3 text-xs font-semibold">{senderName}</span>
      )}
      <button
        type="button"
        onClick={canDelete ? onSelect : undefined}
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-left text-[15px] leading-snug md:max-w-[70%]',
          canDelete ? 'cursor-pointer' : 'cursor-default',
          mine
            ? cn('bg-primary text-primary-foreground', first && 'rounded-tr-md')
            : cn('bg-card border', first && 'rounded-tl-md'),
          deleted && 'text-muted-foreground border border-dashed bg-transparent italic',
          message.pending && 'opacity-70',
          selected && 'ring-ring/60 ring-2',
        )}
      >
        <span className="break-words whitespace-pre-wrap">
          {deleted
            ? 'Mensagem apagada'
            : splitLinks(message.body).map((part, i) =>
                part.href ? (
                  <a
                    key={i}
                    href={part.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium underline underline-offset-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {part.text}
                  </a>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
        </span>
        <span
          className={cn(
            'ml-2 inline-block translate-y-0.5 text-[11px] tabular-nums',
            mine && !deleted ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {message.pending ? 'enviando…' : messageTime(message.created_at)}
        </span>
      </button>
      {selected && canDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive mt-1"
          disabled={deleting}
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" /> Apagar mensagem
        </Button>
      )}
    </div>
  )
}
