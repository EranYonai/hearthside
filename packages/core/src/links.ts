import type { Minor } from './money'

/**
 * Tie recurring bank rows to what they're for: rent coming in for a property, or a payment going
 * out for a loan. Someone picks one bank row as an example; every row with the same description
 * (by its keyed hash), going the same way and close to the expected amount, is tied to it too.
 */

export interface LinkRule {
  id: string
  /** The example row's description key. */
  key: string
  /** The usual amount, positive; null takes any amount. */
  expectedMinor: Minor | null
  /** Rent comes in; loan payments go out. */
  direction: 'in' | 'out'
}

export interface LinkRow {
  id: string
  key: string
  /** Negative is money out. */
  amountMinor: Minor
}

/** How far an amount may drift from the usual one: linked loans and rent change over time. */
export const LINK_TOLERANCE = 0.25
const MIN_TOLERANCE_MINOR = 100

/** Whether an amount is close enough to the usual one. */
export function closeTo(amountMinor: Minor, expectedMinor: Minor | null): boolean {
  if (expectedMinor === null) return true
  const diff = Math.abs(Math.abs(amountMinor) - Math.abs(expectedMinor))
  return diff <= Math.max(Math.abs(expectedMinor) * LINK_TOLERANCE, MIN_TOLERANCE_MINOR)
}

/** Which rule each row belongs to. Several rules can share a description; the closest amount wins. */
export function matchLinks(
  rows: readonly LinkRow[],
  rules: readonly LinkRule[],
): Map<string, string> {
  const byKey = new Map<string, LinkRule[]>()
  for (const r of rules) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r])
  const result = new Map<string, string>()
  for (const row of rows) {
    if (row.amountMinor === 0) continue
    const direction = row.amountMinor > 0 ? 'in' : 'out'
    let best: { rule: LinkRule; diff: number } | undefined
    for (const rule of byKey.get(row.key) ?? []) {
      if (rule.direction !== direction || !closeTo(row.amountMinor, rule.expectedMinor)) continue
      const diff =
        rule.expectedMinor === null
          ? Infinity
          : Math.abs(Math.abs(row.amountMinor) - rule.expectedMinor)
      if (!best || diff < best.diff) best = { rule, diff }
    }
    if (best) result.set(row.id, best.rule.id)
  }
  return result
}

/** Bank rows worth offering as the example: right direction, nearest the usual amount first. */
export function linkCandidates<T extends { amountMinor: Minor; occurredOn: string }>(
  rows: readonly T[],
  direction: 'in' | 'out',
  expectedMinor: Minor | null,
  limit = 8,
): T[] {
  return rows
    .filter((r) => (direction === 'in' ? r.amountMinor > 0 : r.amountMinor < 0))
    .sort((a, b) => {
      if (expectedMinor !== null) {
        const d =
          Math.abs(Math.abs(a.amountMinor) - expectedMinor) -
          Math.abs(Math.abs(b.amountMinor) - expectedMinor)
        if (d !== 0) return d
      }
      return b.occurredOn.localeCompare(a.occurredOn)
    })
    .slice(0, limit)
}

export interface RentSummary {
  /** Average rent a month over the last year (or since the first rent, if sooner). */
  monthlyMinor: Minor
  /** Rent received in the last 12 months. */
  yearMinor: Minor
  /** Yearly rent against the property's value, in percent; null without a value. */
  yieldPercent: number | null
  /** The newest rent, if any. */
  lastOn: string | null
}

/** Rent received for one property, from its linked bank rows. */
export function rentSummary(
  rows: readonly { on: string; minor: Minor }[],
  valueMinor: Minor | null,
  today: string,
): RentSummary {
  const end = Date.parse(`${today}T00:00:00Z`)
  const yearAgo = new Date(end - 365 * 86_400_000).toISOString().slice(0, 10)
  const recent = rows.filter((r) => r.on > yearAgo && r.on <= today && r.minor > 0)
  const yearMinor = recent.reduce((n, r) => n + r.minor, 0)
  const first = recent.reduce<string | null>((m, r) => (m === null || r.on < m ? r.on : m), null)
  // Calendar months covered: from the first rent this year to this month, at most twelve.
  const monthIndex = (d: string) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7))
  const months = first === null ? 12 : Math.min(12, monthIndex(today) - monthIndex(first) + 1)
  const monthlyMinor = recent.length ? Math.round(yearMinor / months) : 0
  const lastOn = rows.reduce<string | null>((m, r) => (m === null || r.on > m ? r.on : m), null)
  return {
    monthlyMinor,
    yearMinor,
    yieldPercent:
      valueMinor && valueMinor > 0 && recent.length
        ? ((monthlyMinor * 12) / valueMinor) * 100
        : null,
    lastOn,
  }
}
