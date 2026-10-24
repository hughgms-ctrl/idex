import { createContext, useContext } from 'react'

import type { Tables } from '@/types/database'

export type MyChurch = {
  id: string
  name: string
  slug: string
  role: Tables<'church_members'>['role']
}

export type MyMinistryMembership = Pick<
  Tables<'ministry_members'>,
  | 'id'
  | 'ministry_id'
  | 'role'
  | 'status'
  | 'can_edit_songs'
  | 'can_manage_song_files'
  | 'can_edit_setlists'
  | 'can_send_announcements'
>

/** Permissões que o líder liga em cada integrante (o líder tem todas). */
export type MinistryPermission = 'songs' | 'song_files' | 'setlists' | 'announcements'

export type ChurchState = {
  churches: MyChurch[]
  church: MyChurch
  ministries: Tables<'ministries'>[]
  ministry: Tables<'ministries'> | null
  memberships: MyMinistryMembership[]
  isOwner: boolean
  isLeader: (ministryId: string) => boolean
  can: (ministryId: string, permission: MinistryPermission) => boolean
  selectChurch: (churchId: string) => void
  selectMinistry: (ministryId: string) => void
}

export const ChurchContext = createContext<ChurchState | null>(null)

export function useChurch(): ChurchState {
  const ctx = useContext(ChurchContext)
  if (!ctx) throw new Error('useChurch precisa estar dentro de <ChurchProvider>')
  return ctx
}
