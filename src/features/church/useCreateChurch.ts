import { useMutation, useQueryClient } from '@tanstack/react-query'

import { clearPendingChurch } from '@/features/church/pending-church'
import type { ChurchInput } from '@/lib/schemas'
import { supabase } from '@/lib/supabase'

export function useCreateChurch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChurchInput & { fullName?: string }) => {
      const { data, error } = await supabase.rpc('create_church', {
        p_church_name: input.churchName,
        p_ministry_name: input.ministryName,
        ...(input.fullName ? { p_full_name: input.fullName } : {}),
      })
      if (error) throw error
      return data
    },
    onSuccess: async (churchId) => {
      clearPendingChurch()
      try {
        localStorage.setItem('idex.churchId', churchId)
      } catch {
        // ignora
      }
      await queryClient.invalidateQueries()
    },
  })
}
