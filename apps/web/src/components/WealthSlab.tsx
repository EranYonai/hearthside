'use client'

import { formatMoney } from '@hearthside/core'
import Link from 'next/link'
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react'
import { HideAmountsToggle } from '@/lib/HideAmountsToggle'

const W = 360
const H = 112
const TOP = 14
const BOTTOM = 6
/** A little room at each end so the line's ends aren't cut off. */
const EDGE = 3

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * The dark "ember" card at the top of Home: the total, how it moved, and a chart you can drag
 * across to see the total on any day. Hidden numbers hide the chart, so scrubbing can't show them.
 */
export function WealthSlab({
  total,
  under,
  change,
  currency,
  series,
  ranges,
}: {
  /** Today's total, already masked for "Hide numbers". */
  total: ReactNode
  /** The line under the total, e.g. "after $199,000 in loans". */
  under?: ReactNode
  change?: { text: string; up: boolean }
  currency: string
  series: { on: string; minor: number }[]
  ranges: { key: string; label: string; href: string; current: boolean }[]
}) {
  const [active, setActive] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const gradient = useId()
  const n = series.length
  const values = series.map((p) => p.minor)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const x = (i: number) => (n > 1 ? EDGE + (i / (n - 1)) * (W - 2 * EDGE) : W - EDGE)
  const y = (v: number) => TOP + (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo)) * (H - TOP - BOTTOM)
  const line = series
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.minor).toFixed(1)}`)
    .join(' ')
  const at = active ?? n - 1
  const last = series.at(-1)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || n < 2) return
    const i = Math.round(((e.clientX - box.left) / box.width) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, i)))
  }
  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowLeft' ? -1 : 1
      setActive(Math.max(0, Math.min(n - 1, (active ?? n - 1) + step)))
    } else if (e.key === 'Escape') setActive(null)
  }
  const diff = active !== null && last ? series[active]!.minor - last.minor : 0

  return (
    <div
      className="ember-slab grid gap-2 overflow-hidden rounded-xl px-4 pt-3"
      data-testid="wealth-slab"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="-ms-2 flex items-center">
          <HideAmountsToggle />
          <span id="wealth-title" className="text-label uppercase text-ink-muted">
            What we own
          </span>
        </span>
        {change && (
          <span
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-0.5 text-caption font-semibold tabular-nums ${change.up ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'}`}
            data-testid="wealth-change"
            data-private-hide
          >
            {change.text}
          </span>
        )}
      </div>
      <div data-testid="wealth-total" aria-live="polite">
        {active === null ? (
          total
        ) : (
          <span className="font-display text-amount-hero tabular-nums">
            {formatMoney(series[active]!.minor, { currency, whole: true })}
          </span>
        )}
      </div>
      <p className="-mt-1 min-h-5 text-caption text-ink-muted">
        {active === null ? (
          under
        ) : (
          <>
            {dayFormat.format(new Date(`${series[active]!.on}T00:00:00Z`))}
            {diff !== 0 &&
              ` · ${formatMoney(diff, { currency, whole: true, signed: true })} vs today`}
          </>
        )}
      </p>
      {n > 1 && (
        <div data-private-hide className="grid gap-1">
          <nav aria-label="Chart range" className="flex gap-0.5">
            {ranges.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                scroll={false}
                replace
                aria-current={r.current ? 'page' : undefined}
                className="rounded-pill px-2.5 py-1 text-[0.75rem] leading-5 font-semibold text-ink-muted aria-[current=page]:bg-white/12 aria-[current=page]:text-ink"
              >
                {r.label}
              </Link>
            ))}
          </nav>
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="-mx-4 block h-28 w-[calc(100%+2rem)] cursor-crosshair touch-none focus-visible:outline-none"
            role="img"
            tabIndex={0}
            aria-label={`What we own from ${dayFormat.format(new Date(`${series[0]!.on}T00:00:00Z`))} to today. Drag or use the arrow keys to see a day.`}
            onPointerDown={pick}
            onPointerMove={pick}
            onPointerLeave={() => setActive(null)}
            onPointerUp={(e) => e.pointerType !== 'mouse' && setActive(null)}
            onKeyDown={keys}
            onBlur={() => setActive(null)}
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--hs-brand)" stopOpacity="0.42" />
                <stop offset="1" stopColor="var(--hs-brand)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill={`url(#${gradient})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--slab-line)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {active !== null && (
              <line
                x1={x(at)}
                x2={x(at)}
                y1={0}
                y2={H}
                stroke="var(--hs-ink)"
                strokeOpacity="0.45"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {/* The dot stays round however wide the chart is stretched. */}
          <span
            aria-hidden
            className="pointer-events-none relative -mt-28 block h-28"
            style={{ marginInline: '-1rem' }}
          >
            <span
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-brand bg-[var(--hs-ink)]"
              style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(series[at]!.minor) / H) * 100}%` }}
            />
          </span>
        </div>
      )}
      {n <= 1 && <span className="pb-3" />}
    </div>
  )
}
