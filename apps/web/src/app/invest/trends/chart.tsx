'use client'

import { formatMoney } from '@hearthside/core'
import { useState } from 'react'

export interface ChartPoint {
  on: string
  valueMinor: number
  contributedMinor: number
}

const W = 600
const H = 200

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const day = (on: string) => dayFormat.format(new Date(`${on}T00:00:00Z`))

/**
 * Value (solid) against money put in (dashed) over time, on one money axis. Hover or touch shows
 * both for the nearest day; the table below carries the same numbers.
 */
export function TrendChart({ points, currency }: { points: ChartPoint[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null)
  const times = points.map((p) => Date.parse(`${p.on}T00:00:00Z`))
  const t0 = times[0]!
  const span = Math.max(times.at(-1)! - t0, 1)
  const values = points.flatMap((p) => [p.valueMinor, p.contributedMinor])
  const top = niceCeil(Math.max(...values, 1))
  const x = (i: number) => ((times[i]! - t0) / span) * W
  const y = (v: number) => H - (Math.max(v, 0) / top) * H
  const path = (pick: (p: ChartPoint) => number) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join('')
  const money = (minor: number) => formatMoney(minor, { currency, whole: true })
  const point = active === null ? null : points[active]!

  function pick(clientX: number, rect: DOMRect) {
    const t = t0 + ((clientX - rect.left) / rect.width) * span
    let best = 0
    times.forEach((ti, i) => {
      if (Math.abs(ti - t) < Math.abs(times[best]! - t)) best = i
    })
    setActive(best)
  }

  return (
    <figure className="grid gap-2" aria-label="Value and money put in over time">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-pill bg-chart-1" /> Value
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-chart-2" /> Money put in
        </span>
      </div>
      <div className="relative">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="flex flex-col justify-between text-[11px] text-ink-faint tabular-nums">
            <span>{money(top)}</span>
            <span>{money(Math.round(top / 2))}</span>
            <span>{money(0)}</span>
          </div>
          <div
            className="relative h-48 touch-none"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
            data-testid="trend-chart"
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              aria-hidden
            >
              {[0, 0.5, 1].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={W}
                  y1={H * f}
                  y2={H * f}
                  stroke="var(--hs-line)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path
                d={path((p) => p.contributedMinor)}
                fill="none"
                stroke="var(--hs-chart-2)"
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={path((p) => p.valueMinor)}
                fill="none"
                stroke="var(--hs-chart-1)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {point && (
              <>
                <span
                  className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint"
                  style={{ left: `${(x(active!) / W) * 100}%` }}
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface-1 bg-chart-1"
                  style={{
                    left: `${(x(active!) / W) * 100}%`,
                    top: `${(y(point.valueMinor) / H) * 100}%`,
                  }}
                  aria-hidden
                />
                <div
                  role="status"
                  className="pointer-events-none absolute top-0 z-10 grid min-w-36 gap-0.5 rounded-md border border-line bg-surface-1 px-2.5 py-1.5 text-caption shadow-card"
                  style={
                    x(active!) > W / 2
                      ? { right: `${100 - (x(active!) / W) * 100}%`, marginRight: 8 }
                      : { left: `${(x(active!) / W) * 100}%`, marginLeft: 8 }
                  }
                >
                  <span className="text-ink-muted">{day(point.on)}</span>
                  <span className="flex justify-between gap-3">
                    Value <b className="tabular-nums">{money(point.valueMinor)}</b>
                  </span>
                  <span className="flex justify-between gap-3">
                    Put in <b className="tabular-nums">{money(point.contributedMinor)}</b>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-between ps-12 pt-1 text-[11px] text-ink-faint">
          <span>{day(points[0]!.on)}</span>
          <span>{day(points.at(-1)!.on)}</span>
        </div>
      </div>
    </figure>
  )
}

/** Round up to 1, 2 or 5 times a power of ten, so the axis reads in round numbers. */
export function niceCeil(minor: number): number {
  const p = 10 ** Math.floor(Math.log10(minor))
  for (const m of [1, 2, 5, 10]) if (m * p >= minor) return m * p
  return 10 * p
}
