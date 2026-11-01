import type { Minor } from './money'
import type { ValuePoint } from './trends'

export interface Balance {
  minor: Minor
  /** The day the balance is from, YYYY-MM-DD. */
  on: string
}

/**
 * The balance a statement ends on: the running balance of its newest row. Files list rows
 * newest first or oldest first, so the order is read from the dates; same-day rows keep the
 * file's order. Null when the file has no balance column.
 */
export function closingBalance(
  rows: readonly { occurredOn: string; balanceMinor?: Minor }[],
): Balance | null {
  const withBalance = rows.filter((r) => r.balanceMinor !== undefined)
  if (withBalance.length === 0) return null
  const first = withBalance[0]!
  const last = withBalance.at(-1)!
  const newestFirst = first.occurredOn > last.occurredOn
  const newest = newestFirst ? first : last
  const on = withBalance.reduce((m, r) => (r.occurredOn > m ? r.occurredOn : m), '')
  return { minor: newest.balanceMinor!, on }
}

/**
 * An account's balance at the end of each day, worked back from a known balance through the
 * money that moved after each day. Days after the known balance keep it.
 */
export function balancesOn(
  known: Balance,
  moves: readonly { on: string; minor: Minor }[],
  days: readonly string[],
): Minor[] {
  return days.map((day) => {
    if (day >= known.on) return known.minor
    const after = moves
      .filter((m) => m.on > day && m.on <= known.on)
      .reduce((n, m) => n + m.minor, 0)
    return known.minor - after
  })
}

/**
 * A series' latest value on or before each day. Before its first value it is zero, or with
 * `backfill` the first value, for things that were held before anyone recorded them.
 */
export function valuesOn(
  points: readonly ValuePoint[],
  days: readonly string[],
  options: { backfill?: boolean } = {},
): Minor[] {
  const sorted = [...points].sort((a, b) => a.on.localeCompare(b.on))
  const before = options.backfill ? (sorted[0]?.valueMinor ?? 0) : 0
  let i = -1
  return days.map((day) => {
    while (i + 1 < sorted.length && sorted[i + 1]!.on <= day) i++
    return i >= 0 ? sorted[i]!.valueMinor : before
  })
}

/** Days for a wealth chart: one a week going back `weeks`, ending today. Oldest first. */
export function weeklyDays(today: string, weeks = 26): string[] {
  const end = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: weeks + 1 }, (_, i) =>
    new Date(end - (weeks - i) * 7 * 86_400_000).toISOString().slice(0, 10),
  )
}

/** Change from a series' first value to its last, with the share when the start isn't zero. */
export function changeOver(values: readonly Minor[]): { minor: Minor; percent: number | null } {
  if (values.length < 2) return { minor: 0, percent: null }
  const start = values[0]!
  const minor = values.at(-1)! - start
  return { minor, percent: start > 0 ? (minor / start) * 100 : null }
}
