import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Trash2, Wand2 } from 'lucide-react'
import { z } from 'zod'

import { useUser } from '@/auth/auth-context'
import { ErrorState } from '@/components/ErrorState'
import { FormField } from '@/components/FormField'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useChurch } from '@/features/church/church-context'
import { ChordSheet } from '@/features/songs/ChordSheet'
import { CifraClubImport } from '@/features/songs/CifraClubImport'
import { chordsOverWordsToChordPro, looksLikeChordPro } from '@/features/songs/chordpro'
import { songKeys, useSong } from '@/features/songs/queries'
import { errorMessage } from '@/lib/errors'
import { KEY_OPTIONS, normalizeKey } from '@/lib/music'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

const schema = z.object({
  title: z.string().trim().min(1, { message: 'Informe o nome da música' }).max(160),
  artist: z.string().trim().max(120),
  originalKey: z.string(),
  bpm: z.string().regex(/^(\d{2,3})?$/, { message: 'BPM entre 20 e 300' }),
  timeSignature: z.string().regex(/^(\d{1,2}\/\d{1,2})?$/, { message: 'Ex.: 4/4, 6/8' }),
  tags: z.string().max(200),
  isNew: z.boolean(),
  links: z.string().max(2000),
  chordpro: z.string().max(50_000),
})
type Values = z.infer<typeof schema>

export function SongEditorPage() {
  const { songId } = useParams()
  const song = useSong(songId)
  if (songId && song.error) return <ErrorState error={song.error} />
  if (songId && song.isPending) return <FullScreenLoader />
  return <Editor song={songId ? (song.data ?? null) : null} />
}

function linksToText(links: unknown): string {
  if (!Array.isArray(links)) return ''
  return links
    .map((l: { label?: string; url?: string }) =>
      l.label ? `${l.label} | ${l.url}` : (l.url ?? ''),
    )
    .join('\n')
}

function textToLinks(text: string): { label: string; url: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split('|').map((s) => s.trim())
      return b ? { label: a ?? '', url: b } : { label: '', url: a ?? '' }
    })
    .filter((l) => /^https?:\/\//.test(l.url))
}

function Editor({ song }: { song: Tables<'songs'> | null }) {
  const navigate = useNavigate()
  const user = useUser()
  const queryClient = useQueryClient()
  const { ministry, isLeader } = useChurch()
  const [view, setView] = useState<'texto' | 'previa'>('texto')
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: song?.title ?? '',
      artist: song?.artist ?? '',
      originalKey: song?.original_key ?? '',
      bpm: song?.bpm ? String(song.bpm) : '',
      timeSignature: song?.time_signature ?? '4/4',
      tags: song?.tags.join(', ') ?? '',
      isNew: song?.is_new ?? false,
      links: linksToText(song?.links),
      chordpro: song?.chordpro ?? '',
    },
  })
  const { errors } = form.formState
  const chordpro = useWatch({ control: form.control, name: 'chordpro' })
  const originalKey = useWatch({ control: form.control, name: 'originalKey' })

  const convert = () => {
    const text = form.getValues('chordpro')
    if (!text.trim()) return
    try {
      form.setValue(
        'chordpro',
        chordsOverWordsToChordPro(text, {
          title: form.getValues('title'),
          key: form.getValues('originalKey'),
        }),
      )
      toast.success('Cifra convertida para ChordPro')
    } catch {
      toast.error('Não consegui converter. Confira se os acordes estão na linha de cima da letra.')
    }
  }

  const save = useMutation({
    mutationFn: async (v: Values) => {
      if (!ministry) throw new Error('Nenhum ministério selecionado')
      const text =
        v.chordpro.trim() && !looksLikeChordPro(v.chordpro)
          ? chordsOverWordsToChordPro(v.chordpro, { title: v.title, key: v.originalKey })
          : v.chordpro
      const row = {
        title: v.title,
        artist: v.artist || null,
        original_key: v.originalKey || null,
        bpm: v.bpm ? Number(v.bpm) : null,
        time_signature: v.timeSignature || null,
        is_new: v.isNew,
        tags: v.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        links: textToLinks(v.links),
        chordpro: text,
      }
      if (song) {
        const { error } = await supabase.from('songs').update(row).eq('id', song.id)
        if (error) throw error
        return song.id
      }
      const { data, error } = await supabase
        .from('songs')
        .insert({
          ...row,
          church_id: ministry.church_id,
          ministry_id: ministry.id,
          created_by: user.id,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: songKeys.all })
      toast.success('Música salva')
      navigate(`/repertorio/${id}`, { replace: true })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!song) return
      const { error } = await supabase.from('songs').delete().eq('id', song.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: songKeys.all })
      toast.success('Música apagada')
      navigate('/repertorio', { replace: true })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (ministry && !isLeader(ministry.id)) {
    return <ErrorState error="Só o líder do ministério cadastra músicas." />
  }

  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link to={song ? `/repertorio/${song.id}` : '/repertorio'}>
          <ArrowLeft aria-hidden="true" /> Voltar
        </Link>
      </Button>
      <PageHeader title={song ? 'Editar música' : 'Nova música'} />
      {!song && ministry && (
        <CifraClubImport
          ministryId={ministry.id}
          onImported={(r) => {
            if (r.title) form.setValue('title', r.title)
            if (r.artist) form.setValue('artist', r.artist)
            const key = r.key ? normalizeKey(r.key) : null
            if (key) form.setValue('originalKey', key)
            form.setValue(
              'chordpro',
              safeConvert(r.text, key ?? '', r.title ?? form.getValues('title')),
            )
            const links = form.getValues('links')
            form.setValue(
              'links',
              [links, `Cifra Club | ${r.sourceUrl}`].filter(Boolean).join('\n'),
            )
            setView('previa')
          }}
        />
      )}
      <form
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField id="song-title" label="Nome" error={errors.title?.message}>
          <Input id="song-title" {...form.register('title')} />
        </FormField>
        <FormField id="song-artist" label="Artista / ministério (opcional)">
          <Input id="song-artist" {...form.register('artist')} />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField id="song-key" label="Tom original">
            <NativeSelect id="song-key" {...form.register('originalKey')}>
              <option value="">—</option>
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="song-bpm" label="BPM" error={errors.bpm?.message}>
            <Input id="song-bpm" inputMode="numeric" {...form.register('bpm')} />
          </FormField>
          <FormField id="song-ts" label="Compasso" error={errors.timeSignature?.message}>
            <Input id="song-ts" {...form.register('timeSignature')} />
          </FormField>
        </div>
        <Controller
          control={form.control}
          name="isNew"
          render={({ field }) => (
            <Label className="min-h-11 cursor-pointer font-normal">
              <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
              Música nova (a banda ainda está aprendendo)
            </Label>
          )}
        />
        <FormField
          id="song-tags"
          label="Etiquetas (separadas por vírgula)"
          hint="Ex.: adoração, ceia, rápida"
        >
          <Input id="song-tags" {...form.register('tags')} />
        </FormField>
        <FormField
          id="song-links"
          label="Links (um por linha)"
          hint="Ex.: YouTube | https://youtube.com/…"
        >
          <textarea
            id="song-links"
            rows={2}
            className="border-input rounded-md border bg-transparent px-3 py-2 text-base md:text-sm"
            {...form.register('links')}
          />
        </FormField>

        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="song-chordpro" className="text-sm font-medium">
              Cifra
            </label>
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList className="h-10 w-auto">
                <TabsTrigger value="texto" className="px-3">
                  Texto
                </TabsTrigger>
                <TabsTrigger value="previa" className="px-3">
                  Prévia
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {view === 'texto' ? (
            <>
              <p className="text-muted-foreground text-xs">
                Cole a cifra como está no site (acordes na linha de cima da letra) e toque em
                “Converter”, ou escreva em ChordPro: <code className="font-mono">[G]Letra</code>.
              </p>
              <textarea
                id="song-chordpro"
                rows={16}
                spellCheck={false}
                className="border-input rounded-md border bg-transparent px-3 py-2 font-mono text-sm leading-relaxed"
                {...form.register('chordpro')}
              />
              <Button type="button" variant="outline" className="self-start" onClick={convert}>
                <Wand2 aria-hidden="true" /> Converter “acordes sobre a letra”
              </Button>
            </>
          ) : (
            <div className="bg-card rounded-2xl border p-4">
              <ChordSheet
                chordpro={
                  chordpro.trim() && !looksLikeChordPro(chordpro)
                    ? safeConvert(chordpro, originalKey)
                    : chordpro
                }
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-2">
          {song ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Apagar "${song.title}"? Ela sai também dos setlists.`))
                  remove.mutate()
              }}
            >
              <Trash2 aria-hidden="true" /> Apagar música
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar música'}
          </Button>
        </div>
      </form>
    </>
  )
}

function safeConvert(text: string, key: string, title?: string): string {
  try {
    return chordsOverWordsToChordPro(text, { key, title })
  } catch {
    return text
  }
}
