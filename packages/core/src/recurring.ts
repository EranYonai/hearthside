import type { Minor } from './money'

export interface RecurringInput {
  /** Rows with the same key are the same payee (a blind index of the description). */
  key: string
  description: string
  /** YYYY-MM-DD. */
  on: string
  /** Negative for money out. */
  minor: Minor
  category: string | null
}

export type Cadence = 'monthly' | 'yearly'

export interface Recurring {
  key: string
  description: string
  category: string | null
  cadence: Cadence
  /** The usual amount, as spending (negative). */
  typicalMinor: Minor
  /** The latest amount, as spending (negative). */
  lastMinor: Minor
  lastOn: string
  /** When the next one is due, YYYY-MM-DD. */
  nextOn: string
  /** How many times it was seen. */
  count: number
  /** Percent the latest amount moved from the usual one, when it moved by more than 5%. */
  changedPercent: number | null
  /** The cost spread over a month, as spending (negative). */
  monthlyMinor: Minor
}

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

function addDays(on: string, n: number) {
  return new Date(Date.parse(`${on}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
}

/**
 * Payments that repeat: the same payee, about a month (or a year) apart, for about the same
 * amount. Monthly needs three payments in different months; yearly needs two. Payees that
 * stopped (nothing for two cycles) are left out. Largest monthly cost first.
 */
export function findRecurring(rows: readonly RecurringInput[], today: string): Recurring[] {
  const groups = new Map<string, RecurringInput[]>()
  for (const r of rows) {
    if (r.minor >= 0 || r.category === 'transfer' || r.category === 'savings') continue
    const list = groups.get(r.key) ?? []
    list.push(r)
    groups.set(r.key, list)
  }
  const found: Recurring[] = []
  for (const [key, all] of groups) {
    // One payment per month: several in one month (e.g. a refill and a top-up) count as one.
    const byMonth = new Map<string, RecurringInput>()
    for (const r of [...all].sort((a, b) => a.on.localeCompare(b.on))) {
      const month = r.on.slice(0, 7)
      const seen = byMonth.get(month)
      byMonth.set(month, seen ? { ...seen, minor: seen.minor + r.minor } : r)
    }
    const list = [...byMonth.values()]
    if (list.length < 2) continue
    const gaps = list.slice(1).map((r, i) => days(list[i]!.on, r.on))
    const gap = median(gaps)
    const cadence: Cadence | null =
      gap >= 25 && gap <= 35 && list.length >= 3
        ? 'monthly'
        : gap >= 350 && gap <= 380
          ? 'yearly'
          : null
    if (!cadence) continue
    const cycle = cadence === 'monthly' ? 30 : 365
    // Regular means most gaps sit near the cycle.
    const regular = gaps.filter((g) => Math.abs(g - cycle) <= cycle * 0.25).length
    if (regular < Math.ceil(gaps.length * 0.6)) continue
    const amounts = list.map((r) => Math.abs(r.minor))
    const typical = median(amounts)
    const steady = amounts.filter((a) => Math.abs(a - typical) <= typical * 0.25).length
    if (steady < Math.ceil(amounts.length * 0.6)) continue
    const last = list.at(-1)!
    if (days(last.on, today) > cycle * 2) continue
    const lastAbs = Math.abs(last.minor)
    const moved = typical ? ((lastAbs - typical) / typical) * 100 : 0
    found.push({
      key,
      description: last.description,
      category: last.category,
      cadence,
      typicalMinor: -typical,
      lastMinor: last.minor,
      lastOn: last.on,
      nextOn: addDays(last.on, gap),
      count: all.length,
      changedPercent: Math.abs(moved) > 5 ? Math.round(moved) : null,
      monthlyMinor: cadence === 'monthly' ? -typical : -Math.round(typical / 12),
    })
  }
  return found.sort((a, b) => a.monthlyMinor - b.monthlyMinor || a.key.localeCompare(b.key))
}
