import type { BudgetStatus } from '@hearthside/core'
import { cx } from '@hearthside/ui'

const FILL: Record<BudgetStatus, string> = {
  ok: 'bg-brand',
  near: 'bg-warning',
  over: 'bg-negative',
}

/**
 * How much of a limit is used. The tick marks where spending would be if it went evenly through
 * the month, so "ahead of pace" shows before the limit is hit. Shares, not amounts, so it stays
 * visible while numbers are hidden.
 */
export function BudgetBar({
  share,
  status,
  elapsed,
  label,
  className,
}: {
  share: number
  status: BudgetStatus
  /** Share of the month gone, 0..1. No tick for whole or future months. */
  elapsed?: number
  label: string
  className?: string
}) {
  const percent = Math.round(share * 100)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={`${percent}% used`}
      data-status={status}
      className={cx('relative h-2 overflow-hidden rounded-pill bg-surface-2', className)}
    >
      <div
        className={cx('h-full rounded-pill', FILL[status])}
        style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share * 100))}%` }}
      />
      {elapsed !== undefined && elapsed > 0 && elapsed < 1 && (
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-ink-muted"
          style={{ left: `${elapsed * 100}%` }}
        />
      )}
    </div>
  )
}
