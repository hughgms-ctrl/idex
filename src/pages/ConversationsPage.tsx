import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Archive,
  BellOff,
  CalendarDays,
  ChevronDown,
  MessageSquarePlus,
  Search,
  Users,
} from 'lucide-react'

import { useUser } from '@/auth/auth-context'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useChurch } from '@/features/church/church-context'
import { conversationTime, previewText, unreadLabel } from '@/features/chat/chat'
import {
  useChurchPeople,
  useConversations,
  type ConversationListRow,
} from '@/features/chat/queries'
import { errorMessage } from '@/lib/errors'
import { formatEventDate, initials } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function ConversationsPage() {
  const { church } = useChurch()
  const user = useUser()
  const conversations = useConversations(church.id)
  const [picking, setPicking] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const rows = conversations.data ?? []
  const active = rows.filter((r) => !r.archived)
  const archived = rows.filter((r) => r.archived)

  return (
    <>
      <PageHeader
        title="Conversas"
        description="Grupo do ministério, conversa de cada culto e mensagens diretas."
        action={
          <Button onClick={() => setPicking(true)}>
            <MessageSquarePlus aria-hidden="true" /> Nova conversa
          </Button>
        }
      />

      {conversations.error ? (
        <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
      ) : conversations.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((row) => (
            <ConversationItem key={row.id} row={row} myId={user.id} />
          ))}
          {active.length === 0 && (
            <li className="text-muted-foreground text-sm">Nenhuma conversa por aqui ainda.</li>
          )}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm font-medium"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="size-4" aria-hidden="true" />
            Arquivadas ({archived.length})
            <ChevronDown
              className={cn('size-4 transition-transform', showArchived && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {showArchived && (
            <>
              <p className="text-muted-foreground text-[13px]">
                Conversas de cultos que já passaram: ficam só para leitura e somem 30 dias depois do
                culto.
              </p>
              <ul className="flex flex-col gap-2 opacity-80">
                {archived.map((row) => (
                  <ConversationItem key={row.id} row={row} myId={user.id} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <NewConversationSheet open={picking} onOpenChange={setPicking} />
    </>
  )
}

function ConversationItem({ row, myId }: { row: ConversationListRow; myId: string }) {
  const unread = row.unread > 0 && !row.archived
  return (
    <li>
      <Link
        to={`/conversas/${row.id}`}
        className="bg-card hover:bg-secondary/60 flex min-h-[72px] items-center gap-3 rounded-2xl border px-3 py-3 transition-colors"
      >
        <ConversationAvatar kind={row.kind} title={row.title} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate text-[15px]', unread ? 'font-bold' : 'font-semibold')}>
              {row.title}
            </span>
            {row.last_message_at && (
              <span
                className={cn(
                  'shrink-0 text-xs',
                  unread && !row.muted ? 'text-primary font-semibold' : 'text-muted-foreground',
                )}
              >
                {conversationTime(row.last_message_at)}
              </span>
            )}
          </div>
          {row.kind === 'event' && row.event_starts_at && (
            <span className="text-primary text-xs font-medium">
              {formatEventDate(row.event_starts_at)}
            </span>
          )}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-[13px]',
                unread ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {previewText(row, myId)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {row.muted && (
                <BellOff className="text-muted-foreground size-4" aria-label="Silenciada" />
              )}
              {unread && (
                <span
                  className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                    row.muted
                      ? 'bg-secondary text-muted-foreground'
                      : 'bg-primary text-primary-foreground',
                  )}
                  aria-label={`${row.unread} sem ler`}
                >
                  {unreadLabel(row.unread)}
                </span>
              )}
            </span>
          </div>
        </div>
      </Link>
    </li>
  )
}

export function ConversationAvatar({
  kind,
  title,
  className,
}: {
  kind: string
  title: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold',
        kind === 'direct' ? 'bg-secondary text-foreground' : 'bg-primary/15 text-primary',
        className,
      )}
      aria-hidden="true"
    >
      {kind === 'ministry' ? (
        <Users className="size-5" />
      ) : kind === 'event' ? (
        <CalendarDays className="size-5" />
      ) : (
        initials(title)
      )}
    </span>
  )
}

function NewConversationSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { church } = useChurch()
  const user = useUser()
  const navigate = useNavigate()
  const people = useChurchPeople(church.id)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const list = (people.data ?? []).filter(
    (p) => p.id !== user.id && (!q || p.name.toLowerCase().includes(q)),
  )

  const start = useMutation({
    mutationFn: async (profileId: string) => {
      const { data, error } = await supabase.rpc('open_direct_conversation', {
        p_church_id: church.id,
        p_profile_id: profileId,
      })
      if (error) throw error
      return data
    },
    onSuccess: (id) => {
      onOpenChange(false)
      void navigate(`/conversas/${id}`)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // não abre o teclado do celular sozinho
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[88dvh] rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))] md:bottom-6 md:mx-auto md:max-w-lg md:rounded-3xl md:border"
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="font-display text-xl">Nova conversa</SheetTitle>
          <SheetDescription>Mensagem direta para alguém da igreja.</SheetDescription>
        </SheetHeader>
        <div className="relative px-4">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pelo nome"
            className="pl-9"
            aria-label="Buscar pelo nome"
          />
        </div>
        <ul className="flex flex-col gap-1 overflow-y-auto px-4 pb-2">
          {people.isPending && <Skeleton className="h-14 rounded-xl" />}
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={start.isPending}
                onClick={() => start.mutate(p.id)}
                className="hover:bg-secondary flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left disabled:opacity-60"
              >
                <ConversationAvatar kind="direct" title={p.name} className="size-10" />
                <span className="truncate font-medium">{p.name}</span>
              </button>
            </li>
          ))}
          {!people.isPending && list.length === 0 && (
            <li className="text-muted-foreground py-4 text-center text-sm">Ninguém encontrado.</li>
          )}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
