import type { Trends } from '@/server/trends'
import { LineChart } from './LineChart'

/**
 * Value over time as a market-style line: green when up over the range, red when down. Shows
 * money put in as a dashed line when there is any. Nothing when there are fewer than two days.
 */
export function ValueChart({ trend, compact = false }: { trend: Trends; compact?: boolean }) {
  const { series } = trend
  if (series.length < 2) return null
  const up = series.at(-1)!.valueMinor >= series[0]!.valueMinor
  const putIn = series.some((p) => p.contributedMinor !== 0)
  return (
    <LineChart
      label={putIn ? 'Value and money put in over time' : 'Value over time'}
      kind="money"
      fit
      area
      compact={compact}
      currency={trend.currency}
      points={series.map((p) => ({
        on: p.on,
        values: putIn ? [p.valueMinor, p.contributedMinor] : [p.valueMinor],
      }))}
      series={[
        { label: 'Value', color: up ? 'positive' : 'negative' },
        ...(putIn ? [{ label: 'Put in', color: 'chart-2' as const, dashed: true }] : []),
      ]}
    />
  )
}
