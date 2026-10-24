import { useState } from 'react'
import { Plus, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export type PickTone = 'yes' | 'neutral' | 'warn' | 'no'

export type PickItem = {
  id: string
  name: string
  tone: PickTone
  badge: string // "pode", "sem resposta", "não pode"…
  detail?: string // "2 no mês", "ensaio: só terça"
}

export type PickGroup = { title: string; hint?: string; items: PickItem[] }

const BADGE: Record<PickTone, string> = {
  yes: 'bg-primary/15 text-primary',
  neutral: 'bg-secondary text-muted-foreground',
  warn: 'bg-warning/15 text-warning',
  no: 'bg-destructive/15 text-destructive',
}

/**
 * Gaveta para escolher quem escalar numa função: sobe de baixo no celular e
 * fica centralizada no computador. Cartões grandes, busca e grupos (quem pode
 * primeiro, depois quem tem restrição e o resto da equipe).
 */
export function MemberPicker({
  open,
  onOpenChange,
  roleName,
  eventLabel,
  groups,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roleName: string
  eventLabel: string
  groups: PickGroup[]
  onPick: (memberId: string) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !q || i.name.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0)
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setQuery('')
        onOpenChange(o)
      }}
    >
      <SheetContent
        side="bottom"
        // não abre o teclado do celular sozinho
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[88dvh] gap-0 rounded-t-3xl md:bottom-6 md:mx-auto md:max-w-lg md:rounded-3xl md:border"
      >
        <div className="bg-border mx-auto mt-2.5 h-1.5 w-12 rounded-full md:hidden" aria-hidden />
        <SheetHeader className="pb-2">
          <SheetTitle className="font-display text-xl">Escalar em {roleName}</SheetTitle>
          <SheetDescription>{eventLabel}</SheetDescription>
        </SheetHeader>
        {total > 6 && (
          <div className="relative px-4 pb-2">
            <Search
              className="text-muted-foreground absolute top-1/2 left-7 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              aria-label="Buscar integrante"
              placeholder="Buscar pelo nome"
              className="h-11 pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pt-1 pb-6">
          {visible.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {total === 0
                ? 'Ninguém da equipe disponível para esta função.'
                : 'Ninguém com esse nome.'}
            </p>
          )}
          {visible.map((g) => (
            <section key={g.title} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wider uppercase">{g.title}</h3>
                {g.hint && <span className="text-muted-foreground text-xs">{g.hint}</span>}
              </div>
              <ul className="flex flex-col gap-2">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(item.id)
                        setQuery('')
                        onOpenChange(false)
                      }}
                      className={cn(
                        'bg-card hover:border-primary flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                        item.tone === 'no' && 'border-destructive/60 bg-destructive/5',
                        item.tone === 'warn' && 'border-warning/60 bg-warning/5',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold',
                          item.tone === 'yes'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground',
                        )}
                        aria-hidden="true"
                      >
                        {initials(item.name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[15px] font-semibold">{item.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              'rounded-md px-1.5 py-0.5 text-xs font-semibold',
                              BADGE[item.tone],
                            )}
                          >
                            {item.badge}
                          </span>
                          {item.detail && (
                            <span className="text-muted-foreground truncate text-xs">
                              {item.detail}
                            </span>
                          )}
                        </span>
                      </span>
                      <Plus className="text-primary size-5 shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
