import type { Minor } from './money'

/** Money in and out for one month. Spending is negative, money in positive. */
export interface MonthFlow {
  /** YYYY-MM. */
  month: string
  spent: Minor
  received: Minor
  /** Spending per category slug ('' for uncategorized), negative. */
  byCategory: Record<string, Minor>
}

export interface PeriodTotals {
  spent: Minor
  received: Minor
  /** What's left: money in plus spending. Negative when more went out than came in. */
  left: Minor
  /** Months that had any money moving. */
  activeMonths: number
}

export function emptyFlow(month: string): MonthFlow {
  return { month, spent: 0, received: 0, byCategory: {} }
}

/** The twelve YYYY-MM months of a year. */
export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

export function sumFlows(flows: readonly MonthFlow[]): PeriodTotals {
  let spent = 0
  let received = 0
  let activeMonths = 0
  for (const f of flows) {
    spent += f.spent
    received += f.received
    if (f.spent || f.received) activeMonths++
  }
  return { spent, received, left: received + spent, activeMonths }
}

export interface CategoryChange {
  /** Category slug, or '' for uncategorized. */
  category: string
  /** Spending in this period, negative. */
  minor: Minor
  /** Spending in the period before, negative. */
  previous: Minor
  /** Spending per month in this period, oldest first, negative. */
  months: Minor[]
  /** Percent change against the period before; null when there was nothing to compare. */
  percent: number | null
}

/**
 * Spending per category for a period, with the same period before it for comparison.
 * Largest spending first; categories only spent on before still show, at the end.
 */
export function categoryChanges(
  current: readonly MonthFlow[],
  previous: readonly MonthFlow[],
): CategoryChange[] {
  const before = new Map<string, Minor>()
  for (const f of previous)
    for (const [c, m] of Object.entries(f.byCategory)) before.set(c, (before.get(c) ?? 0) + m)
  const now = new Map<string, Minor[]>()
  current.forEach((f, i) => {
    for (const [c, m] of Object.entries(f.byCategory)) {
      const row = now.get(c) ?? current.map(() => 0)
      row[i] = (row[i] ?? 0) + m
      now.set(c, row)
    }
  })
  for (const c of before.keys())
    if (!now.has(c))
      now.set(
        c,
        current.map(() => 0),
      )
  return [...now]
    .map(([category, months]) => {
      const minor = months.reduce((a, b) => a + b, 0)
      const prev = before.get(category) ?? 0
      return {
        category,
        minor,
        previous: prev,
        months,
        percent: prev ? Math.round(((minor - prev) / prev) * 100) || 0 : null,
      }
    })
    .sort((a, b) => a.minor - b.minor || a.previous - b.previous)
}
