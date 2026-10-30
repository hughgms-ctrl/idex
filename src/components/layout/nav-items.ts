import {
  CalendarDays,
  Home,
  MessageCircle,
  Music,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

// Mesmos itens do protótipo (Início, Escala, Cifras, Presença) + Conversas e Membros.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/escalas', label: 'Escala', icon: CalendarDays },
  { to: '/repertorio', label: 'Músicas', icon: Music },
  { to: '/presenca', label: 'Presença', icon: UserCheck },
  { to: '/conversas', label: 'Conversas', icon: MessageCircle },
  { to: '/membros', label: 'Membros', icon: Users },
]

// Apoio (som, data show…): só a agenda do ministério.
export const SUPPORT_NAV_ITEMS: NavItem[] = [{ to: '/apoio', label: 'Agenda', icon: CalendarDays }]

/** Telas que quem é só apoio pode abrir (o resto volta para a agenda). */
export function supportCanOpen(pathname: string): boolean {
  return /^\/(apoio(\/|$)|instalar$)/.test(pathname)
}
