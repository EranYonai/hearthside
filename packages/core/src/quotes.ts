import { parseDecimal } from './invest'

/** Prices are at most this old while a market is open. */
export const QUOTE_MAX_AGE_MS = 15 * 60 * 1000
/** A symbol the source didn't know is asked about again after this long. */
export const NOT_FOUND_RETRY_MS = 24 * 60 * 60 * 1000

/**
 * The symbol to ask the quote source for. Local fund and security numbers (all digits, priced in
 * shekels) are listed on the local exchange, which the source suffixes with `.TA`.
 */
export function quoteSymbolFor(symbol: string, currency: string, override?: string | null) {
  if (override) return override
  return /^\d+$/.test(symbol) && currency === 'ILS' ? `${symbol}.TA` : symbol
}

/** Currencies some exchanges quote in hundredths: agorot, pence, cents. */
const SUBUNITS: Record<string, string> = { ILA: 'ILS', GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR' }

export interface Quote {
  /** Exact decimal string, in `currency`'s main unit. */
  price: string
  currency: string
  /** When the price was set at the exchange. */
  at: Date
  prevClose: string | null
}

function toDecimal(n: unknown, subunit: boolean): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  return parseDecimal((subunit ? n / 100 : n).toFixed(subunit ? 8 : 6))
}

/**
 * Read a chart answer: `{ chart: { result: [{ meta: { currency, regularMarketPrice,
 * regularMarketTime, chartPreviousClose } }], error } }`. Null when the symbol is unknown.
 */
export function parseChartQuote(body: unknown): Quote | null {
  const chart = (body as { chart?: { result?: unknown; error?: unknown } } | null)?.chart
  if (!chart) throw new Error('quote: unexpected answer')
  const result = Array.isArray(chart.result) ? chart.result[0] : null
  if (!result) {
    if (chart.error) return null
    throw new Error('quote: empty answer')
  }
  const meta = (result as { meta?: Record<string, unknown> }).meta ?? {}
  const raw = typeof meta.currency === 'string' ? meta.currency : ''
  const subunit = raw in SUBUNITS
  const currency = SUBUNITS[raw] ?? raw.toUpperCase()
  const price = toDecimal(meta.regularMarketPrice, subunit)
  const time = typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : NaN
  if (!/^[A-Z]{3}$/.test(currency) || !price || !Number.isFinite(time)) return null
  return {
    price,
    currency,
    at: new Date(time * 1000),
    prevClose: toDecimal(meta.chartPreviousClose ?? meta.previousClose, subunit),
  }
}

/** Should this instrument be asked about again? */
export function quoteIsDue(
  checkedAt: Date | null,
  status: 'ok' | 'not_found' | 'error' | null,
  now: Date,
): boolean {
  if (!checkedAt) return true
  const age = now.getTime() - checkedAt.getTime()
  return age > (status === 'not_found' ? NOT_FOUND_RETRY_MS : QUOTE_MAX_AGE_MS)
}
