import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useUser } from '@/auth/auth-context'
import { FullScreenLoader } from '@/components/FullScreenLoader'
import { ChurchContext, type ChurchState } from '@/features/church/church-context'
import { useMinistries, useMyChurches, useMyMemberships } from '@/features/church/queries'
import { ErrorState } from '@/components/ErrorState'

const CHURCH_KEY = 'idex.churchId'
const MINISTRY_KEY = 'idex.ministryId'

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // modo privado: só não lembra a escolha
  }
}

export function ChurchProvider({ children }: { children: ReactNode }) {
  const user = useUser()
  const churchesQuery = useMyChurches(user.id)
  const membershipsQuery = useMyMemberships(user.id)
  const [churchId, setChurchId] = useState(() => readPref(CHURCH_KEY))
  const [ministryId, setMinistryId] = useState(() => readPref(MINISTRY_KEY))

  const churches = useMemo(() => churchesQuery.data ?? [], [churchesQuery.data])
  const church = churches.find((c) => c.id === churchId) ?? churches[0]
  const ministriesQuery = useMinistries(church?.id)

  const selectChurch = useCallback((id: string) => {
    writePref(CHURCH_KEY, id)
    setChurchId(id)
  }, [])
  const selectMinistry = useCallback((id: string) => {
    writePref(MINISTRY_KEY, id)
    setMinistryId(id)
  }, [])

  const value = useMemo<ChurchState | null>(() => {
    if (!church) return null
    const ministries = ministriesQuery.data ?? []
    const memberships = (membershipsQuery.data ?? []).filter((m) =>
      ministries.some((min) => min.id === m.ministry_id),
    )
    const isOwner = church.role === 'owner'
    const ministry =
      ministries.find((m) => m.id === ministryId) ??
      ministries.find((m) => memberships.some((mm) => mm.ministry_id === m.id)) ??
      ministries[0] ??
      null
    const isLeader = (id: string) =>
      isOwner ||
      memberships.some(
        (mm) => mm.ministry_id === id && mm.role === 'leader' && mm.status === 'active',
      )
    return {
      churches,
      church,
      ministries,
      ministry,
      memberships,
      isOwner,
      isLeader,
      can: (id, permission) =>
        isLeader(id) ||
        memberships.some(
          (mm) =>
            mm.ministry_id === id &&
            mm.status === 'active' &&
            {
              songs: mm.can_edit_songs,
              song_files: mm.can_manage_song_files,
              setlists: mm.can_edit_setlists,
              announcements: mm.can_send_announcements,
            }[permission],
        ),
      selectChurch,
      selectMinistry,
    }
  }, [
    church,
    churches,
    ministriesQuery.data,
    membershipsQuery.data,
    ministryId,
    selectChurch,
    selectMinistry,
  ])

  const error = churchesQuery.error ?? membershipsQuery.error ?? ministriesQuery.error
  if (error) return <ErrorState error={error} onRetry={() => void churchesQuery.refetch()} />
  if (churchesQuery.isPending || membershipsQuery.isPending) return <FullScreenLoader />
  if (!church) return <Navigate to="/bem-vindo" replace />
  if (ministriesQuery.isPending || !value) return <FullScreenLoader />

  return <ChurchContext.Provider value={value}>{children}</ChurchContext.Provider>
}
