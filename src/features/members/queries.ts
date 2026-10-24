import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const memberKeys = {
  list: (ministryId: string) => ['ministry-members', ministryId] as const,
  invites: (ministryId: string) => ['invites', ministryId] as const,
}

export function useMinistryMembers(ministryId: string | undefined) {
  return useQuery({
    queryKey: memberKeys.list(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministry_members')
        .select(
          'id, church_id, user_id, role, status, joined_at, can_edit_songs, can_manage_song_files, can_edit_setlists, can_send_announcements, profiles(full_name, phone), ministry_member_roles(ministry_role_id)',
        )
        .eq('ministry_id', ministryId ?? '')
      if (error) throw error
      return data
        .map((m) => ({
          ...m,
          name: m.profiles?.full_name || 'Sem nome',
          phone: m.profiles?.phone ?? null,
          roleIds: m.ministry_member_roles.map((r) => r.ministry_role_id),
        }))
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === 'leader' ? -1 : 1
          return a.name.localeCompare(b.name, 'pt-BR')
        })
    },
  })
}

export type MinistryMemberRow = NonNullable<ReturnType<typeof useMinistryMembers>['data']>[number]

export function useActiveInvites(ministryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: memberKeys.invites(ministryId ?? ''),
    enabled: Boolean(ministryId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('ministry_id', ministryId ?? '')
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.filter((i) => i.uses_count < i.max_uses)
    },
  })
}
