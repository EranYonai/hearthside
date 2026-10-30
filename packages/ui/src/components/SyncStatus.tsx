import type { SyncState } from '@hearthside/core'
import { Ban, CircleCheck, Clock, KeyRound, RefreshCw, type LucideIcon } from 'lucide-react'
import { cx } from '../cx'

const STATES: Record<SyncState, { label: string; icon: LucideIcon; tone: string }> = {
  ok: { label: 'Synced', icon: CircleCheck, tone: 'bg-positive-soft text-positive' },
  syncing: { label: 'Syncing', icon: RefreshCw, tone: 'bg-surface-2 text-info' },
  stale: { label: 'Stale', icon: Clock, tone: 'bg-warning-soft text-warning' },
  blocked: { label: 'Blocked', icon: Ban, tone: 'bg-negative-soft text-negative' },
  login: { label: 'Check password', icon: KeyRound, tone: 'bg-negative-soft text-negative' },
}

export interface SyncStatusProps {
  state: SyncState
  /** Time or age, e.g. "06:02" or "2 days". */
  detail?: string
  className?: string
}

/** Freshness pill. Always pairs an icon with a word, never color alone. */
export function SyncStatus({ state, detail, className }: SyncStatusProps) {
  const { label, icon: Icon, tone } = STATES[state]
  return (
    <span
      role="status"
      data-state={state}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill py-0.5 ps-2 pe-2.5',
        'font-body text-xs/[18px] font-semibold whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon
        size={14}
        strokeWidth={2.25}
        aria-hidden
        className={cx(state === 'syncing' && 'motion-safe:animate-spin')}
      />
      {detail ? `${label} · ${detail}` : label}
    </span>
  )
}
