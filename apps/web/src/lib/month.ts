import { monthRange } from '@/server/ledger'

export const monthName = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The month `by` months away from a YYYY-MM string. */
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

export function isMonth(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    monthRange(v)
    return true
  } catch {
    return false
  }
}
