import { Link, useParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowLeft, ArrowUp, X } from 'lucide-react'

import { ErrorState } from '@/components/ErrorState'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useChurch } from '@/features/church/church-context'
import { useEvent } from '@/features/schedule/queries'
import {
  songKeys,
  useCanEditSetlist,
  useSetlist,
  useSongs,
  type SetlistItem,
} from '@/features/songs/queries'
import { useOfflineNextSetlist } from '@/features/songs/useOfflineNextSetlist'
import { errorMessage } from '@/lib/errors'
import { formatEventDate } from '@/lib/format'
import { KEY_OPTIONS } from '@/lib/music'
import { supabase } from '@/lib/supabase'

export function SetlistPage() {
  const { eventId = '' } = useParams()
  const { ministry } = useChurch()
  const event = useEvent(eventId)
  const setlist = useSetlist(eventId)
  const canEdit = useCanEditSetlist(eventId).data === true
  const songs = useSongs(canEdit ? ministry?.id : undefined)
  const queryClient = useQueryClient()
  useOfflineNextSetlist(eventId)
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: songKeys.setlist(eventId) }),
      queryClient.invalidateQueries({ queryKey: songKeys.all }),
    ])

  const add = useMutation({
    mutationFn: async (songId: string) => {
      const ev = event.data
      if (!ev) return
      let setlistId = setlist.data?.id
      if (!setlistId) {
        const { data, error } = await supabase
          .from('setlists')
          .insert({ church_id: ev.church_id, event_id: ev.id })
          .select('id')
          .single()
        if (error) throw error
        setlistId = data.id
      }
      const song = songs.data?.find((s) => s.id === songId)
      const position =
        Math.max(-1, ...(setlist.data?.setlist_items ?? []).map((i) => i.position)) + 1
      const { error } = await supabase.from('setlist_items').insert({
        church_id: ev.church_id,
        setlist_id: setlistId,
        song_id: songId,
        position,
        key: song?.original_key ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const setKey = useMutation({
    mutationFn: async ({ id, key }: { id: string; key: string | null }) => {
      const { error } = await supabase.from('setlist_items').update({ key }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const move = useMutation({
    mutationFn: async ({ a, b }: { a: SetlistItem; b: SetlistItem }) => {
      // troca as posições (duas atualizações)
      const r1 = await supabase
        .from('setlist_items')
        .update({ position: b.position })
        .eq('id', a.id)
      if (r1.error) throw r1.error
      const r2 = await supabase
        .from('setlist_items')
        .update({ position: a.position })
        .eq('id', b.id)
      if (r2.error) throw r2.error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('setlist_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (event.error) return <ErrorState error={event.error} />
  if (event.isPending || setlist.isPending) return <FullScreenLoader />
  if (!event.data) return <ErrorState error="Culto não encontrado." />

  const items = setlist.data?.setlist_items ?? []
  const inSetlist = new Set(items.map((i) => i.song_id))
  const available = (songs.data ?? []).filter((s) => !inSetlist.has(s.id))

  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link to="/repertorio">
          <ArrowLeft aria-hidden="true" /> Cifras
        </Link>
      </Button>
      <PageHeader
        eyebrow="SETLIST"
        title={event.data.title}
        description={`${formatEventDate(event.data.starts_at)} · ${items.length} ${items.length === 1 ? 'música' : 'músicas'}`}
      />
      {canEdit && (
        <p className="text-muted-foreground text-[13px]">
          O tom escolhido aqui vale para toda a banda.
        </p>
      )}

      {items.length === 0 ? (
        <Panel className="text-muted-foreground items-center py-8 text-center text-sm">
          {canEdit
            ? 'Adicione as músicas do culto abaixo.'
            : 'O ministro ainda não montou o setlist.'}
        </Panel>
      ) : (
        <ol className="bg-card flex flex-col overflow-hidden rounded-2xl border">
          {items.map((item, i) => (
            <li
              key={item.id}
              className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
            >
              <span className="text-muted-foreground w-5 text-center font-mono text-[13px]">
                {i + 1}
              </span>
              <Link
                to={`/repertorio/${item.song_id}?culto=${eventId}${item.key ? `&tom=${encodeURIComponent(item.key)}` : ''}`}
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center"
              >
                <span className="truncate text-[15px]">{item.songs?.title}</span>
                {item.songs?.artist && (
                  <span className="text-muted-foreground truncate text-xs">
                    {item.songs.artist}
                  </span>
                )}
              </Link>
              {canEdit ? (
                <>
                  <NativeSelect
                    aria-label={`Tom de ${item.songs?.title}`}
                    wrapperClassName="w-20 shrink-0"
                    className="pr-7 font-mono"
                    value={item.key ?? ''}
                    onChange={(e) => setKey.mutate({ id: item.id, key: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {KEY_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </NativeSelect>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Subir"
                      disabled={i === 0 || move.isPending}
                      onClick={() => {
                        const prev = items[i - 1]
                        if (prev) move.mutate({ a: item, b: prev })
                      }}
                      className="text-muted-foreground flex h-6 w-9 items-center justify-center disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Descer"
                      disabled={i === items.length - 1 || move.isPending}
                      onClick={() => {
                        const nextItem = items[i + 1]
                        if (nextItem) move.mutate({ a: item, b: nextItem })
                      }}
                      className="text-muted-foreground flex h-6 w-9 items-center justify-center disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Tirar ${item.songs?.title} do setlist`}
                    onClick={() => remove.mutate(item.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <span className="bg-secondary text-primary rounded-lg px-2 py-1 font-mono text-[13px] font-semibold">
                  {item.key ?? item.songs?.original_key ?? '—'}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <NativeSelect
          aria-label="Adicionar música"
          value=""
          disabled={add.isPending}
          onChange={(e) => e.target.value && add.mutate(e.target.value)}
        >
          <option value="">+ Adicionar música</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.original_key ? ` (${s.original_key})` : ''}
            </option>
          ))}
        </NativeSelect>
      )}
    </>
  )
}
