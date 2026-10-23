import type { LucideIcon } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { Panel } from '@/components/Section'

export function ComingSoonPage({
  title,
  icon: Icon,
  phase,
  description,
}: {
  title: string
  icon: LucideIcon
  phase: string
  description: string
}) {
  return (
    <>
      <PageHeader title={title} />
      <Panel className="items-center gap-4 border-dashed py-10 text-center">
        <Icon className="text-muted-foreground size-8" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <span className="text-primary text-xs font-semibold tracking-wider">{phase}</span>
          <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
        </div>
      </Panel>
    </>
  )
}
