import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('font-display text-[22px] font-bold tracking-tight', className)}>
      ide<span className="text-primary">.x</span>
    </span>
  )
}
