import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export const announcementKeys = {
  list: (ministryId: string) => ['announcements', ministryId] as const,
  events: (ministryId: string) => ['announcements', 'events', ministryId] as const,
  audience: (ministryId: string, audience: string, eventId: string, memberIds: string[]) =>
    ['announcements', 'audience', ministryId, audience, eventId, memberIds] as const,
  deliveries: (announcementId: string) => ['announcements', 'deliveries', announcementId] as const,
}

/** Últimos avisos do ministério (agendados primeiro). */
export function useAnnouncements(ministryId: string | undefined) {
  return useQuery({
    queryKey: announcementKeys.list(ministryId ?? ''),
    enabled: Boolean(ministryId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*, events(title, starts_at)')
        .eq('ministry_id', ministryId ?? '')
        .order('send_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return data
    },
  })
}

/** Cultos e ensaios dos próximos 60 dias (para os modelos e "equipe do evento"). */
export function useUpcomingEvents(ministryId: string | undefined) {
  return useQuery({
    queryKey: announcementKeys.events(ministryId ?? ''),
    enabled: Boolean(ministryId),
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 3_600_000).toISOString()
      const until = new Date(Date.now() + 60 * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('events')
        .select('id, title, kind, starts_at, arrive_at')
        .eq('ministry_id', ministryId ?? '')
        .gte('starts_at', since)
        .lte('starts_at', until)
        .order('starts_at')
      if (error) throw error
      return data
    },
  })
}

/** Quem recebe o aviso com essa escolha e por onde (celular, WhatsApp). */
export function useAudiencePeople(
  ministryId: string | undefined,
  audience: string,
  eventId: string,
  memberIds: string[],
) {
  return useQuery({
    queryKey: announcementKeys.audience(ministryId ?? '', audience, eventId, memberIds),
    enabled: Boolean(ministryId) && (audience !== 'event' || Boolean(eventId)),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('announcement_audience_people', {
        p_ministry_id: ministryId ?? '',
        p_audience: audience,
        ...(eventId ? { p_event_id: eventId } : {}),
        p_member_ids: memberIds,
      })
      if (error) throw error
      return [...data].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))
    },
  })
}

/** Situação de cada pessoa num aviso enviado. */
export function useDeliveries(announcementId: string | null) {
  return useQuery({
    queryKey: announcementKeys.deliveries(announcementId ?? ''),
    enabled: Boolean(announcementId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('announcement_deliveries', {
        p_announcement_id: announcementId ?? '',
      })
      if (error) throw error
      return data
    },
  })
}
