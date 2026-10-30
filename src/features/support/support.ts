// Contas puras da tela do apoio (som, data show…).
import { semitonesBetween } from '@/lib/music'

type KeyedItem = { key: string | null; songs: { original_key: string | null } | null }

/** Tom do culto: o que o líder definiu na setlist; sem isso, o original da música. */
export function serviceKey(item: KeyedItem): string | null {
  return item.key ?? item.songs?.original_key ?? null
}

/** Quantos semitons a cifra cadastrada precisa andar para o tom do culto. */
export function serviceSemitones(item: KeyedItem): number {
  return semitonesBetween(item.songs?.original_key, item.key)
}

type TeamRow = { status: string; role: string; rolePosition: number; name: string }

/** Equipe por função (sem quem recusou ou ficou de fora), na ordem das funções. */
export function teamByRole(team: TeamRow[]): { role: string; names: string[] }[] {
  const groups = new Map<string, { role: string; position: number; names: string[] }>()
  for (const t of team) {
    if (t.status === 'declined' || t.status === 'benched') continue
    const g = groups.get(t.role) ?? { role: t.role, position: t.rolePosition, names: [] }
    g.names.push(t.name)
    groups.set(t.role, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.position - b.position || a.role.localeCompare(b.role, 'pt-BR'))
    .map((g) => ({ role: g.role, names: g.names.sort((a, b) => a.localeCompare(b, 'pt-BR')) }))
}

/** Cabeçalho de cada música no texto copiado: "1. Título — Tom: G". */
export function songHeading(position: number, title: string, key: string | null): string {
  return `${position}. ${title}${key ? ` — Tom: ${key}` : ''}`
}
