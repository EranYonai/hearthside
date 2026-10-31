'use client'

import { formatMoney } from '@hearthside/core'
import { useState } from 'react'

export interface ChartPoint {
  on: string
  /** One number per series: minor units for money, main units for prices. */
  values: number[]
}

export interface ChartSeries {
  label: string
  /** A chart token, e.g. "chart-1". */
  color: 'chart-1' | 'chart-2'
  dashed?: boolean
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

const SWATCH = { 'chart-1': 'border-chart-1', 'chart-2': 'border-chart-2' }
const DOT = { 'chart-1': 'bg-chart-1', 'chart-2': 'bg-chart-2' }

/**
 * Lines over time on one axis. Hover or touch shows every series for the nearest day; pages carry
 * the same numbers in a table.
 */
export function LineChart({
  points,
  series,
  currency,
  kind,
  label,
}: {
  points: ChartPoint[]
  series: ChartSeries[]
  currency: string
  /** money: values are minor units, axis from zero. price: main units, axis fits the range. */
  kind: 'money' | 'price'
  label: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const times = points.map((p) => Date.parse(`${p.on}T00:00:00Z`))
  const t0 = times[0]!
  const span = Math.max(times.at(-1)! - t0, 1)
  const values = points.flatMap((p) => p.values)
  const [bottom, top] =
    kind === 'money'
      ? [0, niceCeil(Math.max(...values, 1))]
      : padRange(Math.min(...values), Math.max(...values))
  const x = (i: number) => ((times[i]! - t0) / span) * W
  const y = (v: number) => H - ((Math.max(v, bottom) - bottom) / (top - bottom)) * H
  const path = (s: number) =>
    points
      .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.values[s]!).toFixed(1)}`)
      .join('')
  const format = (n: number) =>
    kind === 'money'
      ? formatMoney(Math.round(n), { currency, whole: true })
      : new Intl.NumberFormat('en-IL', {
          style: 'currency',
          currencyDisplay: 'narrowSymbol',
          currency,
          maximumFractionDigits: n >= 100 ? 2 : 4,
        }).format(n)
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
    <figure className="grid gap-2" aria-label={label}>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted" aria-hidden>
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span
                className={`w-4 border-t-2 ${s.dashed ? 'border-dashed' : ''} ${SWATCH[s.color]}`}
              />{' '}
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <div className="flex flex-col justify-between text-[11px] text-ink-faint tabular-nums">
            <span>{format(top)}</span>
            <span>{format((top + bottom) / 2)}</span>
            <span>{format(bottom)}</span>
          </div>
          <div
            className="relative h-48 touch-none"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setActive(null)}
            data-testid="line-chart"
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
              {series
                .map((s, i) => ({ s, i }))
                .reverse()
                .map(({ s, i }) => (
                  <path
                    key={s.label}
                    d={path(i)}
                    fill="none"
                    stroke={`var(--hs-${s.color})`}
                    strokeWidth={2}
                    strokeDasharray={s.dashed ? '5 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </svg>
            {point && (
              <>
                <span
                  className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint"
                  style={{ left: `${(x(active!) / W) * 100}%` }}
                  aria-hidden
                />
                <span
                  className={`pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface-1 ${DOT[series[0]!.color]}`}
                  style={{
                    left: `${(x(active!) / W) * 100}%`,
                    top: `${(y(point.values[0]!) / H) * 100}%`,
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
                  {series.map((s, i) => (
                    <span key={s.label} className="flex justify-between gap-3">
                      {s.label} <b className="tabular-nums">{format(point.values[i]!)}</b>
                    </span>
                  ))}
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

/** A little room above and below a price line, so it doesn't touch the edges. */
export function padRange(min: number, max: number): [number, number] {
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1
  return [Math.max(0, min - pad), max + pad]
}
