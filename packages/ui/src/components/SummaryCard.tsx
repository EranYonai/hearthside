import type { Minor } from '@hearthside/core'
import type { CSSProperties } from 'react'
import { Amount } from './Amount'
import { Card, Label } from './Card'

export interface SummarySegment {
  name: string
  minor: Minor
  /** Share of the meter, 0..100. */
  percent: number
}

/** One account's slice of the meter, outlined in the account's color. */
export interface SummaryGroup {
  key: string
  name: string
  /** The account color (hex), or none for a neutral outline. */
  color?: string | null
  minor: Minor
  /** This account's spending per segment name. */
  parts: { name: string; minor: Minor }[]
}

export interface SummaryCardProps {
  label: string
  minor: Minor
  segments?: SummarySegment[]
  /** Group the meter by account: each group outlined, its categories inside. */
  groups?: SummaryGroup[]
  onSeeAll?: () => void
}

const SEGMENT_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']
const OTHER = 'bg-chart-other'
const LEGEND_MAX = 4

/**
 * Outline color for a group. Mixed a little toward the ink color so a dark brand still shows on
 * the dark theme and a pale one on the light theme.
 */
function outline(color: string | null | undefined): CSSProperties {
  return {
    outlineColor: color
      ? `color-mix(in oklab, ${color} 72%, var(--color-ink))`
      : 'var(--color-ink-faint)',
  }
}

/** The one card that opens a screen: a label, the hero amount, an optional meter. */
export function SummaryCard({ label, minor, segments = [], groups, onSeeAll }: SummaryCardProps) {
  const ranked = [...segments].sort((a, b) => b.percent - a.percent)
  const sorted = ranked.slice(0, SEGMENT_COLORS.length)
  const legend = sorted.slice(0, LEGEND_MAX)
  const colorOf = new Map(ranked.map((s, i) => [s.name, SEGMENT_COLORS[i] ?? OTHER]))
  const shownGroups = (groups ?? [])
    .map((g) => ({ ...g, minor: Math.abs(g.minor) }))
    .filter((g) => g.minor > 0)
    .sort((a, b) => b.minor - a.minor)
  const grouped = shownGroups.length > 1
  return (
    <Card aria-label={label}>
      <Label>{label}</Label>
      <Amount minor={minor} whole hero />
      {sorted.length > 0 && (
        <>
          {grouped ? (
            <div className="flex h-3 gap-1.5 px-0.5" data-testid="meter-groups">
              {shownGroups.map((g) => {
                const parts = g.parts
                  .map((p) => ({ ...p, minor: Math.abs(p.minor) }))
                  .filter((p) => p.minor > 0)
                  .sort(
                    (a, b) =>
                      ranked.findIndex((s) => s.name === a.name) -
                      ranked.findIndex((s) => s.name === b.name),
                  )
                return (
                  <span
                    key={g.key}
                    data-group={g.name}
                    title={g.name}
                    className="flex h-full min-w-1.5 overflow-hidden rounded-pill outline-2 outline-offset-1"
                    style={{
                      flex: `${g.minor} 1 0`,
                      outlineStyle: 'solid',
                      ...outline(g.color),
                    }}
                    aria-hidden
                  >
                    {parts.map((p) => (
                      <span
                        key={p.name}
                        className={`block h-full ${colorOf.get(p.name) ?? OTHER}`}
                        style={{ flex: `${p.minor} 1 0` }}
                      />
                    ))}
                  </span>
                )
              })}
            </div>
          ) : (
            <div className="flex h-2 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
              {sorted.map((s, i) => (
                <span
                  key={s.name}
                  className={`block h-full ${SEGMENT_COLORS[i]}`}
                  style={{ width: `${Math.max(0, Math.min(100, s.percent))}%` }}
                />
              ))}
            </div>
          )}
          {grouped && (
            <ul aria-label="By account" className="flex flex-wrap gap-x-4 gap-y-1">
              {shownGroups.map((g) => (
                <li key={g.key} className="flex items-center gap-1.5 text-caption text-ink-muted">
                  <span
                    className="h-2 w-3.5 rounded-pill outline-2 outline-offset-1"
                    style={{ outlineStyle: 'solid', ...outline(g.color) }}
                    aria-hidden
                  />
                  {g.name}
                  <Amount minor={g.minor} whole className="text-caption text-ink-muted" />
                </li>
              ))}
            </ul>
          )}
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
