import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const churchKeys = {
  mine: (userId: string) => ['my-churches', userId] as const,
  ministries: (churchId: string) => ['ministries', churchId] as const,
  memberships: (userId: string) => ['my-memberships', userId] as const,
}

export function useMyChurches(userId: string) {
  return useQuery({
    queryKey: churchKeys.mine(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('church_members')
        .select('role, churches(id, name, slug)')
        .eq('user_id', userId)
        .order('created_at')
      if (error) throw error
      return data.flatMap((row) => (row.churches ? [{ ...row.churches, role: row.role }] : []))
    },
  })
}

export function useMinistries(churchId: string | undefined) {
  return useQuery({
    queryKey: churchKeys.ministries(churchId ?? ''),
    enabled: Boolean(churchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministries')
        .select('*')
        .eq('church_id', churchId ?? '')
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useMyMemberships(userId: string) {
  return useQuery({
    queryKey: churchKeys.memberships(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministry_members')
        .select(
          'id, ministry_id, role, status, can_edit_songs, can_manage_song_files, can_edit_setlists, can_send_announcements',
        )
        .eq('user_id', userId)
      if (error) throw error
      return data
    },
  })
}
