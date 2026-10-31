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

export const HISTORY_RANGES = [
  { key: '1mo', label: '1M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
] as const

export type HistoryRange = (typeof HISTORY_RANGES)[number]['key']

export function isHistoryRange(value: unknown): value is HistoryRange {
  return HISTORY_RANGES.some((r) => r.key === value)
}

export interface PriceHistory {
  currency: string
  /** Daily closes, oldest first; `price` is an exact decimal string. */
  points: { on: string; price: string }[]
  /** What the source says the instrument is, e.g. "ETF" or "MUTUALFUND". */
  type: string | null
  exchange: string | null
  longName: string | null
}

/**
 * Read a daily chart answer: `meta` as for a quote, plus `timestamp[]` and
 * `indicators.quote[0].close[]`. Days without a close are skipped. Null when the symbol is
 * unknown.
 */
export function parseChartHistory(body: unknown): PriceHistory | null {
  const chart = (body as { chart?: { result?: unknown; error?: unknown } } | null)?.chart
  if (!chart) throw new Error('history: unexpected answer')
  const result = Array.isArray(chart.result) ? chart.result[0] : null
  if (!result) {
    if (chart.error) return null
    throw new Error('history: empty answer')
  }
  const r = result as {
    meta?: Record<string, unknown>
    timestamp?: unknown
    indicators?: { quote?: { close?: unknown }[] }
  }
  const meta = r.meta ?? {}
  const raw = typeof meta.currency === 'string' ? meta.currency : ''
  const subunit = raw in SUBUNITS
  const currency = SUBUNITS[raw] ?? raw.toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return null
  const times = Array.isArray(r.timestamp) ? r.timestamp : []
  const closes = r.indicators?.quote?.[0]?.close
  const byDay = new Map<string, string>()
  times.forEach((t, i) => {
    const price = Array.isArray(closes) ? toDecimal(closes[i], subunit) : null
    if (typeof t === 'number' && Number.isFinite(t) && price)
      byDay.set(new Date(t * 1000).toISOString().slice(0, 10), price)
  })
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null)
  return {
    currency,
    points: [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([on, price]) => ({ on, price })),
    type: text(meta.instrumentType),
    exchange: text(meta.fullExchangeName ?? meta.exchangeName),
    longName: text(meta.longName ?? meta.shortName),
  }
}

/** Facts a member keeps about a fund: yearly fee, index tracked, domicile and documents. */
export interface FundFacts {
  /** Yearly fee in percent, as an exact decimal string, e.g. "0.07". */
  fee: string | null
  index: string | null
  domicile: string | null
  documents: { label: string; url: string }[]
}

export class FundFactsError extends Error {}

/** Check fund facts typed by a member; links must be https. */
export function cleanFundFacts(input: {
  fee?: unknown
  index?: unknown
  domicile?: unknown
  documents?: unknown
}): FundFacts {
  const text = (v: unknown, max: number, what: string) => {
    const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''
    if (s.length > max) throw new FundFactsError(`Keep the ${what} under ${max} characters`)
    return s || null
  }
  const rawFee = typeof input.fee === 'string' ? input.fee.trim().replace(/%$/, '').trim() : ''
  const fee = rawFee ? parseDecimal(rawFee) : null
  if (rawFee && (fee === null || Number(fee) > 10))
    throw new FundFactsError('Enter the yearly fee as a percent, like 0.07')
  const docs = Array.isArray(input.documents) ? input.documents : []
  if (docs.length > 5) throw new FundFactsError('Keep it to 5 documents')
  const documents = docs.flatMap((d) => {
    const { label, url } = (d ?? {}) as { label?: unknown; url?: unknown }
    const link = typeof url === 'string' ? url.trim() : ''
    if (!link) return []
    let parsed: URL
    try {
      parsed = new URL(link)
    } catch {
      throw new FundFactsError('Document links must be full web addresses')
    }
    if (parsed.protocol !== 'https:' || link.length > 500)
      throw new FundFactsError('Document links must start with https://')
    return [{ label: text(label, 40, 'document name') ?? parsed.hostname, url: parsed.toString() }]
  })
  return {
    fee,
    index: text(input.index, 80, 'index name'),
    domicile: text(input.domicile, 40, 'domicile'),
    documents,
  }
}
