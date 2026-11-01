'use client'

import type { Minor } from '@hearthside/core'
import { Amount, cx } from '@hearthside/ui'
import { X } from 'lucide-react'
import { useRef, useState } from 'react'

const OPEN = 96

/**
 * One row of the import preview. Swipe it left (or use the × on a computer) to leave it out
 * of the import; a row that's out shows "Put back". Rows already here can't be taken out.
 */
export function ImportRow({
  merchant,
  meta,
  minor,
  original,
  installment,
  duplicate,
  removed,
  onToggle,
}: {
  merchant: string
  meta: string
  minor: Minor
  original?: { minor: Minor; currency: string } | null
  installment?: { n: number; total: number } | null
  duplicate: boolean
  removed: boolean
  onToggle: () => void
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; base: number } | null>(null)
  const moved = useRef(false)
  const swipeable = !duplicate && !removed

  const remove = () => {
    setDx(0)
    onToggle()
  }

  return (
    <li className="relative overflow-hidden" data-import-row data-removed={removed || undefined}>
      {swipeable && (
        <button
          type="button"
          onClick={remove}
          tabIndex={dx ? 0 : -1}
          aria-hidden={dx ? undefined : true}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-negative-soft px-3 text-caption font-semibold text-negative"
          style={{ width: OPEN }}
        >
          Remove
        </button>
      )}
      <div
        className="relative flex min-h-11 items-center gap-3 bg-surface-1 py-2 transition-transform duration-150"
        style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          if (!swipeable) return
          const t = e.touches[0]!
          start.current = { x: t.clientX, y: t.clientY, base: dx }
          moved.current = false
        }}
        onTouchMove={(e) => {
          const s = start.current
          if (!s) return
          const t = e.touches[0]!
          const x = t.clientX - s.x
          if (!moved.current && Math.abs(t.clientY - s.y) > Math.abs(x)) {
            start.current = null
            return
          }
          if (Math.abs(x) > 8) moved.current = true
          setDx(Math.max(-OPEN, Math.min(0, s.base + x)))
        }}
        onTouchEnd={() => {
          if (!start.current) return
          start.current = null
          setDx((d) => (d < -OPEN / 2 ? -OPEN : 0))
        }}
        onClick={() => {
          // A tap on an open row closes it.
          if (dx && !moved.current) setDx(0)
          moved.current = false
        }}
      >
        <div className={cx('grid min-w-0 flex-1', (duplicate || removed) && 'opacity-60')}>
          <span className="flex items-center gap-1 overflow-hidden text-body-strong whitespace-nowrap">
            <bdi className={cx('truncate', removed && 'line-through')}>{merchant}</bdi>
            {installment && (
              <span className="inline-flex items-center rounded-sm bg-brand-soft px-2 py-px font-display text-[11px]/4 font-semibold text-brand-ink tabular-nums">
                {installment.n}/{installment.total}
              </span>
            )}
          </span>
          <span className="truncate text-caption text-ink-muted">
            {removed ? `Left out · ${meta}` : duplicate ? `Already here · ${meta}` : meta}
          </span>
        </div>
        <div className={cx('text-end', (duplicate || removed) && 'opacity-60')}>
          <Amount minor={minor} signed {...(original ? { original } : {})} />
        </div>
        {removed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={`Put ${merchant} back in the import`}
            className="rounded-sm px-2 py-1 text-caption font-semibold text-brand-ink underline"
          >
            Put back
          </button>
        ) : (
          !duplicate && (
            <button
              type="button"
              onClick={remove}
              aria-label={`Leave ${merchant} out of the import`}
              title="Leave out"
              className="hidden size-8 flex-none place-items-center rounded-pill text-ink-muted hover:bg-surface-2 focus-visible:grid focus-visible:outline-2 focus-visible:outline-focus [@media(hover:hover)]:grid"
            >
              <X size={16} aria-hidden />
            </button>
          )
        )}
      </div>
    </li>
  )
}
