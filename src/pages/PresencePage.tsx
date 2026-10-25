import { PageHeader } from '@/components/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useChurch } from '@/features/church/church-context'
import {
  LiveEventPanel,
  PendingReviews,
  TeamBalances,
} from '@/features/attendance/LeaderAttendance'
import { RulesCard, TeamGoal } from '@/features/attendance/Gamification'
import { MemberAttendance } from '@/features/attendance/MemberAttendance'
import { usePendingReviews } from '@/features/attendance/queries'
import { useMinistryMembers } from '@/features/members/queries'
import { useMinistryRoles, useMinistrySettings, useOpenCycle } from '@/features/ministries/queries'

export function PresencePage() {
  const { church, ministry, memberships, isLeader } = useChurch()
  const leader = ministry ? isLeader(ministry.id) : false
  const myMember = memberships.find((m) => m.ministry_id === ministry?.id)
  const settings = useMinistrySettings(ministry?.id)
  const cycle = useOpenCycle(ministry?.id)
  const members = useMinistryMembers(leader ? ministry?.id : undefined)
  const roles = useMinistryRoles(leader ? ministry?.id : undefined)
  const pending = usePendingReviews(ministry?.id, leader)

  if (!ministry) return <PageHeader title="Presença" description="Nenhum ministério cadastrado." />

  const memberView = myMember ? (
    <MemberAttendance
      churchId={church.id}
      memberId={myMember.id}
      cycle={cycle.data ?? null}
      settings={settings.data ?? null}
    />
  ) : null

  const pendingCount =
    (pending.data?.requests.length ?? 0) + (pending.data?.justifications.length ?? 0)
  const s = settings.data
  const rules = s && <RulesCard settings={s} leader={leader} />

  if (!leader) {
    return (
      <>
        <PageHeader title="Presença" />
        {memberView}
        {rules}
      </>
    )
  }

  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]))
  return (
    <>
      <PageHeader eyebrow="VISÃO DO LÍDER" title="Presença" />
      <Tabs defaultValue="ao-vivo">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="ao-vivo" className="min-h-9">
            Ao vivo
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="min-h-9">
            Pedidos{pendingCount ? ` (${pendingCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="equipe" className="min-h-9">
            Pontos
          </TabsTrigger>
          {memberView && (
            <TabsTrigger value="eu" className="min-h-9">
              Meus
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="ao-vivo" className="flex flex-col gap-4">
          <LiveEventPanel
            ministryId={ministry.id}
            members={members.data ?? []}
            roleName={roleName}
            settings={settings.data ?? null}
          />
        </TabsContent>
        <TabsContent value="pedidos">
          <PendingReviews
            ministryId={ministry.id}
            limit={s?.checkin_request_limit_per_cycle ?? 3}
          />
        </TabsContent>
        <TabsContent value="equipe" className="flex flex-col gap-4">
          <TeamGoal ministryId={ministry.id} />
          <TeamBalances
            ministryId={ministry.id}
            cycleId={cycle.data?.id}
            members={members.data ?? []}
            minPoints={s?.cycle_min_points ?? 70}
          />
        </TabsContent>
        {memberView && (
          <TabsContent value="eu" className="flex flex-col gap-4">
            {memberView}
          </TabsContent>
        )}
      </Tabs>
      {rules}
    </>
  )
}
