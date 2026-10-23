import { useQuery } from '@tanstack/react-query'

import { useUser } from '@/auth/auth-context'
import { supabase } from '@/lib/supabase'

export function useMyProfile() {
  const user = useUser()
  return useQuery({
    queryKey: ['profile', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .eq('id', user.id)
        .single()
      if (error) throw error
      return data
    },
  })
}
