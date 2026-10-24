import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const ministryKeys = {
  roles: (ministryId: string) => ['ministry-roles', ministryId] as const,
  settings: (ministryId: string) => ['ministry-settings', ministryId] as const,
  openCycle: (ministryId: string) => ['open-cycle', ministryId] as const,
  nextEvent: (ministryId: string) => ['next-event', ministryId] as const,
}

export function useMinistryRoles(ministryId: string | undefined) {
  return useQuery({
    queryKey: ministryKeys.roles(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministry_roles')
        .select('*')
        .eq('ministry_id', ministryId ?? '')
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export function useMinistrySettings(ministryId: string | undefined) {
  return useQuery({
    queryKey: ministryKeys.settings(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ministry_settings')
        .select('*')
        .eq('ministry_id', ministryId ?? '')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useOpenCycle(ministryId: string | undefined) {
  return useQuery({
    queryKey: ministryKeys.openCycle(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cycles')
        .select('*')
        .eq('ministry_id', ministryId ?? '')
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useNextEvent(ministryId: string | undefined) {
  return useQuery({
    queryKey: ministryKeys.nextEvent(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, kind, starts_at, arrive_at, location_name')
        .eq('ministry_id', ministryId ?? '')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useMyBalance(ministryMemberId: string | undefined, cycleId: string | undefined) {
  return useQuery({
    queryKey: ['my-balance', ministryMemberId, cycleId],
    enabled: Boolean(ministryMemberId && cycleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_cycle_balance')
        .select('balance, penalties')
        .eq('ministry_member_id', ministryMemberId ?? '')
        .eq('cycle_id', cycleId ?? '')
        .maybeSingle()
      if (error) throw error
      return data ? { balance: data.balance ?? 0, penalties: data.penalties ?? 0 } : null
    },
  })
}
