import type { MinistryPermission, MyMinistryMembership } from '@/features/church/church-context'

/**
 * Visão do app para quem gere (dono ou líder): "gestão" (normal) ou "equipe"
 * (vê as telas como um integrante comum, para conferir a experiência).
 * Só muda a interface: o banco continua com as permissões reais.
 */
export type ViewMode = 'manage' | 'team'

type Membership = Pick<
  MyMinistryMembership,
  | 'ministry_id'
  | 'role'
  | 'status'
  | 'can_edit_songs'
  | 'can_manage_song_files'
  | 'can_edit_setlists'
  | 'can_send_announcements'
>

/** Dono da igreja ou líder ativo de algum ministério: pode trocar a visão. */
export function canSwitchView(isOwner: boolean, memberships: Membership[]): boolean {
  return isOwner || memberships.some((m) => m.role === 'leader' && m.status === 'active')
}

/** Papéis que valem na tela, de acordo com a visão escolhida. */
export function effectiveAccess(params: {
  isOwner: boolean
  memberships: Membership[]
  mode: ViewMode
}): {
  isOwner: boolean
  isLeader: (ministryId: string) => boolean
  can: (ministryId: string, permission: MinistryPermission) => boolean
} {
  const team = params.mode === 'team'
  const isOwner = params.isOwner && !team
  const isLeader = (id: string) =>
    !team &&
    (isOwner ||
      params.memberships.some(
        (mm) => mm.ministry_id === id && mm.role === 'leader' && mm.status === 'active',
      ))
  // na visão da equipe, nenhum integrante tem chavinha ligada: mostra o básico
  const can = (id: string, permission: MinistryPermission) =>
    isLeader(id) ||
    (!team &&
      params.memberships.some(
        (mm) =>
          mm.ministry_id === id &&
          mm.status === 'active' &&
          {
            songs: mm.can_edit_songs,
            song_files: mm.can_manage_song_files,
            setlists: mm.can_edit_setlists,
            announcements: mm.can_send_announcements,
          }[permission],
      ))
  return { isOwner, isLeader, can }
}
