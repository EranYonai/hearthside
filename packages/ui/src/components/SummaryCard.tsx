import type { Minor } from '@hearthside/core'
import { Amount } from './Amount'
import { Card, Label } from './Card'

export interface SummarySegment {
  name: string
  minor: Minor
  /** Share of the meter, 0..100. */
  percent: number
}

export interface SummaryCardProps {
  label: string
  minor: Minor
  segments?: SummarySegment[]
  onSeeAll?: () => void
}

const SEGMENT_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']
const LEGEND_MAX = 4

/** The one card that opens a screen: a label, the hero amount, an optional meter. */
export function SummaryCard({ label, minor, segments = [], onSeeAll }: SummaryCardProps) {
  const sorted = [...segments].sort((a, b) => b.percent - a.percent).slice(0, SEGMENT_COLORS.length)
  const legend = sorted.slice(0, LEGEND_MAX)
  return (
    <Card aria-label={label}>
      <Label>{label}</Label>
      <Amount minor={minor} whole hero />
      {sorted.length > 0 && (
        <>
          <div className="flex h-2 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
            {sorted.map((s, i) => (
              <span
                key={s.name}
                className={`block h-full ${SEGMENT_COLORS[i]}`}
                style={{ width: `${Math.max(0, Math.min(100, s.percent))}%` }}
              />
            ))}
          </div>
          <ul className="grid gap-1">
            {legend.map((s, i) => (
              <li key={s.name} className="flex items-baseline justify-between gap-2 text-caption">
                <span className="flex items-center gap-2 text-ink-muted">
                  <span className={`size-2 rounded-pill ${SEGMENT_COLORS[i]}`} aria-hidden />
                  {s.name}
                </span>
                <Amount minor={s.minor} whole className="text-caption" />
              </li>
            ))}
          </ul>
          {segments.length > LEGEND_MAX && onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="justify-self-start text-body-strong text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              See all
            </button>
          )}
        </>
      )}
    </Card>
  )
}
