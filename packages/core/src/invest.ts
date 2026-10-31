import type { Minor } from './money'

/**
 * Investments: holdings are units of an instrument, each priced in the instrument's own
 * currency. Units and prices are exact decimal strings (funds and fractional shares go past
 * two decimals); values come out as integer minor units like everything else.
 */

export const ASSET_CLASSES = [
  { slug: 'global_stocks', label: 'Global stocks', group: 'stocks' },
  { slug: 'local_stocks', label: 'Local stocks', group: 'stocks' },
  { slug: 'bonds', label: 'Bonds', group: 'bonds' },
  { slug: 'cash', label: 'Cash', group: 'bonds' },
  { slug: 'real_estate', label: 'Real estate', group: 'stocks' },
  { slug: 'other', label: 'Other', group: 'stocks' },
] as const

export type AssetClass = (typeof ASSET_CLASSES)[number]['slug']

export function isAssetClass(value: unknown): value is AssetClass {
  return ASSET_CLASSES.some((c) => c.slug === value)
}

export function assetClassLabel(slug: AssetClass): string {
  return ASSET_CLASSES.find((c) => c.slug === slug)!.label
}

/** Currencies a holding can be priced in (ISO 4217). All have two minor digits, like Minor. */
export const HOLDING_CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD'] as const

export function isHoldingCurrency(value: unknown): value is (typeof HOLDING_CURRENCIES)[number] {
  return HOLDING_CURRENCIES.includes(value as (typeof HOLDING_CURRENCIES)[number])
}

const DECIMAL = /^\d{1,15}(\.\d{1,10})?$/

/**
 * Normalize a user-typed decimal: accepts `1,234.5` and ` 12 `, rejects negatives, exponents
 * and junk. Returns the canonical string (no thousands separators, no trailing zeros) or null.
 */
export function parseDecimal(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const raw = String(input).trim().replaceAll(',', '')
  if (!DECIMAL.test(raw)) return null
  const [whole, frac = ''] = raw.split('.')
  const w = whole!.replace(/^0+(?=\d)/, '')
  const f = frac.replace(/0+$/, '')
  return f ? `${w}.${f}` : w
}

function toScaled(decimal: string): { n: bigint; scale: number } {
  const [whole, frac = ''] = decimal.split('.')
  return { n: BigInt(whole! + frac), scale: frac.length }
}

/** Round half away from zero: n / 10^scale, for non-negative n. */
function roundDiv(n: bigint, scale: number): bigint {
  if (scale <= 0) return n * 10n ** BigInt(-scale)
  const d = 10n ** BigInt(scale)
  return (n + d / 2n) / d
}

/** units × price, in minor units (two decimals) of the price's currency. */
export function valueMinor(units: string, price: string): Minor {
  const u = toScaled(units)
  const p = toScaled(price)
  return Number(roundDiv(u.n * p.n * 100n, u.scale + p.scale))
}

/** A decimal string as minor units, e.g. a cash balance of "12.345" is 1235. */
export function decimalToMinor(decimal: string): Minor {
  return valueMinor(decimal, '1')
}

/** Exchange rates as "units of quote per one base", keyed `BASE/QUOTE`, e.g. `USD/ILS`. */
export type Rates = ReadonlyMap<string, number>

/** Convert minor units between currencies; null when no rate (direct or inverse) is known. */
export function convertMinor(minor: Minor, from: string, to: string, rates: Rates): Minor | null {
  if (from === to) return minor
  const direct = rates.get(`${from}/${to}`)
  if (direct) return Math.round(minor * direct)
  const inverse = rates.get(`${to}/${from}`)
  if (inverse) return Math.round(minor / inverse)
  return null
}

export interface PricedHolding {
  accountId: string
  assetClass: AssetClass
  currency: string
  /** Null when the holding has no price yet. */
  valueMinor: Minor | null
}

export interface PortfolioSummary {
  currency: string
  /** Everything that could be converted to `currency`. */
  totalMinor: Minor
  /** Values with no exchange rate yet, per their own currency. */
  unconverted: Record<string, Minor>
  /** Holdings with no price yet. */
  unpriced: number
  byClass: Partial<Record<AssetClass, Minor>>
  byAccount: Record<string, Minor>
}

export function summarizePortfolio(
  holdings: readonly PricedHolding[],
  currency: string,
  rates: Rates,
): PortfolioSummary {
  const summary: PortfolioSummary = {
    currency,
    totalMinor: 0,
    unconverted: {},
    unpriced: 0,
    byClass: {},
    byAccount: {},
  }
  for (const h of holdings) {
    if (h.valueMinor === null) {
      summary.unpriced++
      continue
    }
    const v = convertMinor(h.valueMinor, h.currency, currency, rates)
    if (v === null) {
      summary.unconverted[h.currency] = (summary.unconverted[h.currency] ?? 0) + h.valueMinor
      continue
    }
    summary.totalMinor += v
    summary.byClass[h.assetClass] = (summary.byClass[h.assetClass] ?? 0) + v
    summary.byAccount[h.accountId] = (summary.byAccount[h.accountId] ?? 0) + v
  }
  return summary
}

export interface AllocationSlice {
  slug: AssetClass
  label: string
  minor: Minor
  /** Whole percent; slices add up to 100 (largest remainder). */
  percent: number
}

/** Allocation by asset class, largest first. Empty when there is nothing to split. */
export function allocation(byClass: PortfolioSummary['byClass']): AllocationSlice[] {
  const entries = ASSET_CLASSES.map((c) => ({
    slug: c.slug,
    label: c.label,
    minor: byClass[c.slug] ?? 0,
  })).filter((e) => e.minor > 0)
  const total = entries.reduce((n, e) => n + e.minor, 0)
  if (total <= 0) return []
  const exact = entries.map((e) => (e.minor / total) * 100)
  const floors = exact.map(Math.floor)
  let left = 100 - floors.reduce((n, f) => n + f, 0)
  const order = exact.map((x, i) => ({ i, r: x - floors[i]! })).sort((a, b) => b.r - a.r)
  for (const { i } of order) {
    if (left-- <= 0) break
    floors[i]!++
  }
  return entries.map((e, i) => ({ ...e, percent: floors[i]! })).sort((a, b) => b.minor - a.minor)
}

/** Ticker or fund number as typed: trimmed, upper case, inner spaces removed. */
export function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Every pair between the given currencies, from rates against one base (e.g. EUR → USD 1.08,
 * EUR → ILS 4.0 gives USD/ILS 3.7037…). The base itself counts as 1.
 */
export function crossRates(base: string, perBase: Readonly<Record<string, number>>): Rates {
  const all: Record<string, number> = { ...perBase, [base]: 1 }
  const rates = new Map<string, number>()
  for (const [from, a] of Object.entries(all))
    for (const [to, b] of Object.entries(all))
      if (from !== to && a > 0 && b > 0) rates.set(`${from}/${to}`, b / a)
  return rates
}
