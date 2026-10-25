import { CalendarDays, Home, Music, UserCheck, Users, type LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// Mesmos itens do protótipo (Início, Escala, Cifras, Presença) + Membros.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/escalas', label: 'Escala', icon: CalendarDays },
  { to: '/repertorio', label: 'Músicas', icon: Music },
  { to: '/presenca', label: 'Presença', icon: UserCheck },
  { to: '/membros', label: 'Membros', icon: Users },
]
