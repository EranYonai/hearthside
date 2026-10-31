import type { Minor } from './money'

/** Money moving in or out of an investment account, other than trades. */
export const MOVEMENT_KINDS = [
  { slug: 'deposit', label: 'Deposit', sign: 1 },
  { slug: 'withdrawal', label: 'Withdrawal', sign: -1 },
  { slug: 'fee', label: 'Fee', sign: -1 },
  { slug: 'tax', label: 'Tax', sign: -1 },
  { slug: 'dividend', label: 'Dividend', sign: 1 },
  { slug: 'interest', label: 'Interest', sign: 1 },
] as const

export type MovementKind = (typeof MOVEMENT_KINDS)[number]['slug']

export function isMovementKind(value: unknown): value is MovementKind {
  return MOVEMENT_KINDS.some((k) => k.slug === value)
}

export function movementLabel(kind: string): string {
  return MOVEMENT_KINDS.find((k) => k.slug === kind)?.label ?? kind
}

/** Sign of the amount stored for a movement: money in is positive, money out negative. */
export function movementSign(kind: MovementKind): 1 | -1 {
  return MOVEMENT_KINDS.find((k) => k.slug === kind)!.sign
}

export const TREND_RANGES = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: 'ytd', label: 'YTD' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
] as const

export type TrendRange = (typeof TREND_RANGES)[number]['key']

export function isTrendRange(value: unknown): value is TrendRange {
  return TREND_RANGES.some((r) => r.key === value)
}

/** First day (YYYY-MM-DD) a range covers, or null for all time. */
export function rangeStart(range: TrendRange, today: string): string | null {
  if (range === 'all') return null
  if (range === 'ytd') return `${today.slice(0, 4)}-01-01`
  const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[range]
  const d = new Date(`${today}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - months)
  // Clamp to the month's last day (31 Mar minus 1M is 28/29 Feb, not 3 Mar).
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}

export interface ValuePoint {
  on: string
  valueMinor: Minor
}

export interface Flow {
  on: string
  kind: MovementKind
  /** Signed: money in is positive. */
  amountMinor: Minor
}

/** Deposits and withdrawals: money the household put in or took out. */
export function isExternal(kind: MovementKind): boolean {
  return kind === 'deposit' || kind === 'withdrawal'
}

/**
 * Sum several accounts' daily values into one series. On each day an account counts with its
 * latest value on or before that day, so an account skipped one day doesn't dip the total.
 */
export function combineSeries(series: readonly (readonly ValuePoint[])[]): ValuePoint[] {
  const days = [...new Set(series.flatMap((s) => s.map((p) => p.on)))].sort()
  const sorted = series.map((s) => [...s].sort((a, b) => a.on.localeCompare(b.on)))
  const cursor = sorted.map(() => -1)
  return days.map((on) => {
    let total = 0
    sorted.forEach((s, i) => {
      while (cursor[i]! + 1 < s.length && s[cursor[i]! + 1]!.on <= on) cursor[i]!++
      if (cursor[i]! >= 0) total += s[cursor[i]!]!.valueMinor
    })
    return { on, valueMinor: total }
  })
}

/** Net money put in (deposits minus withdrawals) up to and including each day. */
export function contributedBy(flows: readonly Flow[], days: readonly string[]): Minor[] {
  const external = flows.filter((f) => isExternal(f.kind)).sort((a, b) => a.on.localeCompare(b.on))
  let i = 0
  let total = 0
  return days.map((day) => {
    while (i < external.length && external[i]!.on <= day) total += external[i++]!.amountMinor
    return total
  })
}

/**
 * Time-weighted return between consecutive values: each step's growth after taking out the
 * money moved in or out during it, chained. Deposits don't count as gains. Null when there's no
 * step with a starting value.
 */
export function timeWeightedReturn(
  points: readonly ValuePoint[],
  flows: readonly Flow[],
): number | null {
  const sorted = [...points].sort((a, b) => a.on.localeCompare(b.on))
  const external = flows.filter((f) => isExternal(f.kind))
  let growth = 1
  let steps = 0
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (prev.valueMinor <= 0) continue
    const moved = external
      .filter((f) => f.on > prev.on && f.on <= cur.on)
      .reduce((n, f) => n + f.amountMinor, 0)
    growth *= (cur.valueMinor - moved) / prev.valueMinor
    steps++
  }
  return steps === 0 ? null : growth - 1
}

export interface YearSummary {
  year: number
  /** Time-weighted return for the year, from the last value of the year before when known. */
  returnRate: number | null
  deposits: Minor
  withdrawals: Minor
  /** Fees and taxes, as a positive amount. */
  fees: Minor
  /** Dividends and interest. */
  income: Minor
}

/** Per calendar year, newest first: return, money in and out, fees and income. */
export function yearSummaries(
  points: readonly ValuePoint[],
  flows: readonly Flow[],
): YearSummary[] {
  const sorted = [...points].sort((a, b) => a.on.localeCompare(b.on))
  const years = new Set<number>([
    ...sorted.map((p) => Number(p.on.slice(0, 4))),
    ...flows.map((f) => Number(f.on.slice(0, 4))),
  ])
  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const inYear = flows.filter((f) => Number(f.on.slice(0, 4)) === year)
      const sum = (kinds: readonly MovementKind[]) =>
        inYear.filter((f) => kinds.includes(f.kind)).reduce((n, f) => n + f.amountMinor, 0)
      // The year's steps start from the last value before it, so 1 Jan's move counts.
      const before = sorted.filter((p) => p.on < `${year}-01-01`).at(-1)
      const during = sorted.filter((p) => p.on.startsWith(`${year}-`))
      return {
        year,
        returnRate: timeWeightedReturn(before ? [before, ...during] : during, flows),
        deposits: sum(['deposit']),
        withdrawals: 0 - sum(['withdrawal']),
        fees: 0 - sum(['fee', 'tax']),
        income: sum(['dividend', 'interest']),
      }
    })
}

export interface TrendPoint {
  on: string
  valueMinor: Minor
  contributedMinor: Minor
}

/**
 * The series a chart draws for a range: value and money put in on each day with a value. The
 * last value before the range starts it off, so a quiet month still has a line.
 */
export function trendSeries(
  points: readonly ValuePoint[],
  flows: readonly Flow[],
  start: string | null,
): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.on.localeCompare(b.on))
  const inRange = start === null ? sorted : sorted.filter((p) => p.on >= start)
  const before =
    start === null || inRange[0]?.on === start
      ? undefined
      : sorted.filter((p) => p.on < start).at(-1)
  const list = before ? [{ ...before, on: start! }, ...inRange] : inRange
  const contributed = contributedBy(
    flows,
    list.map((p) => p.on),
  )
  return list.map((p, i) => ({
    on: p.on,
    valueMinor: p.valueMinor,
    contributedMinor: contributed[i]!,
  }))
}
