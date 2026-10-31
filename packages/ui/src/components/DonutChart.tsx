import { formatMoney, type Minor } from '@hearthside/core'
import type { ReactNode } from 'react'
import { Amount } from './Amount'

export interface DonutSlice {
  key: string
  name: string
  /** Size of the slice, minor units. Sign is ignored. */
  minor: Minor
  /** Where the legend row leads, e.g. the list filtered to this slice. */
  href?: string
}

export interface ShownSlice extends DonutSlice {
  /** Share of the whole, 0..100. */
  percent: number
  /** A chart color token: chart-1..chart-5, or chart-other. */
  color: ChartColor
}

export type ChartColor = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'chart-other'

const PALETTE: ChartColor[] = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']
const STROKE: Record<ChartColor, string> = {
  'chart-1': 'stroke-chart-1',
  'chart-2': 'stroke-chart-2',
  'chart-3': 'stroke-chart-3',
  'chart-4': 'stroke-chart-4',
  'chart-5': 'stroke-chart-5',
  'chart-other': 'stroke-chart-other',
}
export const CHART_BG: Record<ChartColor, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  'chart-other': 'bg-chart-other',
}

/**
 * Largest first, at most `max` slices: past that, the tail folds into one "Other" slice so every
 * color stays tellable apart.
 */
export function donutSlices(slices: DonutSlice[], max = 5, otherName = 'Other'): ShownSlice[] {
  const sorted = slices
    .map((s) => ({ ...s, minor: Math.abs(s.minor) }))
    .filter((s) => s.minor > 0)
    .sort((a, b) => b.minor - a.minor)
  const total = sorted.reduce((n, s) => n + s.minor, 0)
  if (total === 0) return []
  const head = sorted.length > max ? sorted.slice(0, max - 1) : sorted
  const tail = sorted.slice(head.length)
  const shown: ShownSlice[] = head.map((s, i) => ({
    ...s,
    percent: (s.minor / total) * 100,
    color: PALETTE[i]!,
  }))
  if (tail.length > 0) {
    const minor = tail.reduce((n, s) => n + s.minor, 0)
    shown.push({
      key: 'other',
      name: otherName,
      minor,
      percent: (minor / total) * 100,
      color: 'chart-other',
    })
  }
  return shown
}

// r = 100 / 2π, so the circumference is 100 and dash lengths read as percents.
const R = 15.9155
const GAP = 0.8

/**
 * A donut of shares with the total in its hole, and a legend that carries the numbers. The ring is
 * decoration for sighted readers; the legend is the accessible source.
 */
export function DonutChart({
  slices,
  label,
  center,
  max = 5,
  otherName,
  currency,
}: {
  slices: DonutSlice[]
  /** Names the chart for assistive tech, e.g. "Spending by category". */
  label: string
  /** Shown in the hole, e.g. the total. */
  center?: ReactNode
  max?: number
  otherName?: string
  currency?: string
}) {
  const shown = donutSlices(slices, max, otherName)
  const gap = shown.length > 1 ? GAP : 0
  const starts = shown.map((_, i) => shown.slice(0, i).reduce((n, s) => n + s.percent, 0))
  return (
    <figure aria-label={label} className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden>
          <circle cx="21" cy="21" r={R} fill="none" strokeWidth="5" className="stroke-surface-2" />
          {shown.map((s, i) => {
            const length = Math.max(s.percent - gap, 0.4)
            const offset = -starts[i]!
            return (
              <circle
                key={s.key}
                data-slice={s.key}
                cx="21"
                cy="21"
                r={R}
                fill="none"
                strokeWidth="5"
                pathLength={100}
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={offset}
                className={STROKE[s.color]}
              />
            )
          })}
        </svg>
        {center && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">{center}</div>
        )}
      </div>
      <ul className="grid min-w-0 flex-[1_1_11rem] gap-1">
        {shown.map((s) => {
          const row = (
            <>
              <span className={`size-2.5 rounded-pill ${CHART_BG[s.color]}`} aria-hidden />
              <span className="truncate text-ink-muted">{s.name}</span>
              <span className="text-end">
                <Amount minor={s.minor} whole currency={currency} className="text-caption" />
                <span className="ms-1.5 text-caption text-ink-faint tabular-nums">
                  {Math.round(s.percent)}%
                </span>
              </span>
            </>
          )
          const cls =
            'grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm text-caption'
          return (
            <li key={s.key}>
              {s.href ? (
                <a
                  href={s.href}
                  aria-label={`${s.name}, ${formatMoney(s.minor, { currency, whole: true })}, ${Math.round(s.percent)}%`}
                  className={`${cls} hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus`}
                >
                  {row}
                </a>
              ) : (
                <div className={cls}>{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
