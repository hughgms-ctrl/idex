import { describe, expect, it } from 'vitest'

import { canSwitchView, effectiveAccess } from './view-mode'

const base = {
  status: 'active' as const,
  can_edit_songs: false,
  can_manage_song_files: false,
  can_edit_setlists: false,
  can_send_announcements: false,
}
const leader = { ...base, ministry_id: 'louvor', role: 'leader' as const }
const helper = { ...base, ministry_id: 'louvor', role: 'member' as const, can_edit_songs: true }

describe('visão equipe × gestão', () => {
  it('só dono ou líder troca a visão', () => {
    expect(canSwitchView(false, [leader])).toBe(true)
    expect(canSwitchView(true, [])).toBe(true)
    expect(canSwitchView(false, [helper])).toBe(false)
  })

  it('na gestão vale o papel real', () => {
    const a = effectiveAccess({ isOwner: true, memberships: [leader], mode: 'manage' })
    expect(a.isOwner).toBe(true)
    expect(a.isLeader('louvor')).toBe(true)
    expect(a.can('louvor', 'announcements')).toBe(true)
  })

  it('na visão da equipe ninguém é líder nem tem permissão extra', () => {
    const a = effectiveAccess({ isOwner: true, memberships: [leader, helper], mode: 'team' })
    expect(a.isOwner).toBe(false)
    expect(a.isLeader('louvor')).toBe(false)
    expect(a.can('louvor', 'songs')).toBe(false)
  })

  it('integrante com permissão continua com ela na gestão', () => {
    const a = effectiveAccess({ isOwner: false, memberships: [helper], mode: 'manage' })
    expect(a.isLeader('louvor')).toBe(false)
    expect(a.can('louvor', 'songs')).toBe(true)
    expect(a.can('louvor', 'setlists')).toBe(false)
  })
})
