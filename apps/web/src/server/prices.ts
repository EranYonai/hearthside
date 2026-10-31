import {
  type HistoryRange,
  parseChartHistory,
  parseChartQuote,
  type PriceHistory,
  quoteIsDue,
  quoteSymbolFor,
  type Quote,
} from '@hearthside/core'
import type { Db } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, asc, desc, eq, gte } from 'drizzle-orm'

const { instruments, holdings, instrumentPrices } = schema

const FETCH_TIMEOUT_MS = 5000
const PARALLEL = 4

/**
 * Where market prices come from: a public chart feed (no key), up to 15 minutes delayed.
 * "off" never fetches (tests, offline).
 */
export function quoteSourceUrl(env: Record<string, string | undefined> = process.env) {
  const url = env.QUOTES_URL || 'https://query1.finance.yahoo.com'
  return url === 'off' ? null : url.replace(/\/+$/, '')
}

type Outcome = { status: 'ok'; quote: Quote } | { status: 'not_found' | 'error' }

async function fetchQuote(base: string, symbol: string, doFetch: typeof fetch): Promise<Outcome> {
  try {
    const res = await doFetch(
      `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Hearthside)' },
      },
    )
    if (res.status === 404) return { status: 'not_found' }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const quote = parseChartQuote(await res.json())
    return quote ? { status: 'ok', quote } : { status: 'not_found' }
  } catch (err) {
    console.error(JSON.stringify({ level: 'warn', msg: 'price lookup failed', error: String(err) }))
    return { status: 'error' }
  }
}

/** Run `fn` over `items`, a few at a time. */
async function eachLimited<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!)
  })
  await Promise.all(workers)
}

export interface RefreshReport {
  asked: number
  priced: number
  notFound: number
  failed: number
}

/** Ask the quote source about every held security that is due, and store new prices. */
export async function refreshQuotes(
  db: Db,
  options: { url: string; fetch?: typeof fetch; now?: Date },
): Promise<RefreshReport> {
  const now = options.now ?? new Date()
  const doFetch = options.fetch ?? fetch
  const held = await db
    .selectDistinct({ instrument: instruments })
    .from(instruments)
    .innerJoin(holdings, eq(holdings.instrumentId, instruments.id))
    .where(eq(instruments.kind, 'security'))
  const due = held
    .map((r) => r.instrument)
    .filter((i) => quoteIsDue(i.checkedAt, i.quoteStatus, now))
  const report: RefreshReport = { asked: due.length, priced: 0, notFound: 0, failed: 0 }

  await eachLimited(due, PARALLEL, async (instrument) => {
    const symbol = quoteSymbolFor(instrument.symbol, instrument.currency, instrument.quoteSymbol)
    const outcome = await fetchQuote(options.url, symbol, doFetch)
    // A quote in another currency than the holding's would be read wrong; leave it unpriced.
    const quote =
      outcome.status === 'ok' && outcome.quote.currency === instrument.currency
        ? outcome.quote
        : null
    const status = quote ? 'ok' : outcome.status === 'ok' ? 'not_found' : outcome.status
    if (status === 'not_found') report.notFound++
    else if (status === 'error') report.failed++
    else report.priced++

    await db.transaction(async (tx) => {
      if (quote) {
        const [last] = await tx
          .select({ pricedAt: instrumentPrices.pricedAt })
          .from(instrumentPrices)
          .where(
            and(
              eq(instrumentPrices.instrumentId, instrument.id),
              eq(instrumentPrices.source, 'market'),
            ),
          )
          .orderBy(desc(instrumentPrices.pricedAt))
          .limit(1)
        if (!last || last.pricedAt.getTime() !== quote.at.getTime())
          await tx.insert(instrumentPrices).values({
            instrumentId: instrument.id,
            price: quote.price,
            pricedAt: quote.at,
            source: 'market',
          })
      }
      await tx
        .update(instruments)
        .set({
          checkedAt: now,
          quoteStatus: status,
          ...(quote ? { prevClose: quote.prevClose } : {}),
        })
        .where(eq(instruments.id, instrument.id))
    })
  })
  return report
}

let inFlight: Promise<unknown> | undefined

/**
 * Keep prices fresh for a page: refresh in the background when anything is due, and wait only
 * when a held security has never been looked up (so a new holding shows its price at once).
 */
export async function keepQuotesFresh(
  db: Db,
  options: { url?: string | null; fetch?: typeof fetch; now?: Date } = {},
): Promise<void> {
  const url = options.url === undefined ? quoteSourceUrl() : options.url
  if (!url) return
  const now = options.now ?? new Date()
  const held = await db
    .selectDistinct({ checkedAt: instruments.checkedAt, status: instruments.quoteStatus })
    .from(instruments)
    .innerJoin(holdings, eq(holdings.instrumentId, instruments.id))
    .where(eq(instruments.kind, 'security'))
  if (!held.some((i) => quoteIsDue(i.checkedAt, i.status, now))) return
  inFlight ??= refreshQuotes(db, { url, fetch: options.fetch, now })
    .catch((err: unknown) =>
      console.error(
        JSON.stringify({ level: 'warn', msg: 'price refresh failed', error: String(err) }),
      ),
    )
    .finally(() => {
      inFlight = undefined
    })
  if (held.some((i) => i.checkedAt === null)) await inFlight
}

const HISTORY_TTL_MS = 60 * 60 * 1000
const RANGE_DAYS: Record<HistoryRange, number> = { '1mo': 31, '6mo': 183, '1y': 366, '5y': 1827 }
const historyCache = new Map<string, { at: number; history: PriceHistory | null }>()

export interface HistoryView {
  points: { on: string; price: string }[]
  /** Where the points came from: the quote source, or prices stored here. */
  from: 'source' | 'stored'
  type: string | null
  exchange: string | null
  longName: string | null
}

/**
 * Daily closes for a security over a range: from the quote source (cached for an hour), or the
 * prices stored here when the source is off or doesn't know it. Only the symbol is sent.
 */
export async function priceHistory(
  db: Db,
  instrument: { id: string; symbol: string; currency: string; quoteSymbol: string | null },
  range: HistoryRange,
  options: { url?: string | null; fetch?: typeof fetch; now?: Date } = {},
): Promise<HistoryView> {
  const url = options.url === undefined ? quoteSourceUrl() : options.url
  const now = options.now ?? new Date()
  if (url) {
    const symbol = quoteSymbolFor(instrument.symbol, instrument.currency, instrument.quoteSymbol)
    const key = `${url}|${symbol}|${range}`
    let hit = historyCache.get(key)
    if (!hit || now.getTime() - hit.at > HISTORY_TTL_MS) {
      hit = {
        at: now.getTime(),
        history: await fetchHistory(url, symbol, range, options.fetch ?? fetch),
      }
      historyCache.set(key, hit)
    }
    const h = hit.history
    if (h && h.currency === instrument.currency && h.points.length > 1)
      return {
        points: h.points,
        from: 'source',
        type: h.type,
        exchange: h.exchange,
        longName: h.longName,
      }
  }
  const since = new Date(now.getTime() - RANGE_DAYS[range] * 86_400_000)
  const rows = await db
    .select({ price: instrumentPrices.price, pricedAt: instrumentPrices.pricedAt })
    .from(instrumentPrices)
    .where(
      and(eq(instrumentPrices.instrumentId, instrument.id), gte(instrumentPrices.pricedAt, since)),
    )
    .orderBy(asc(instrumentPrices.pricedAt))
  // The last price of each day.
  const byDay = new Map(rows.map((r) => [r.pricedAt.toISOString().slice(0, 10), r.price]))
  return {
    points: [...byDay].map(([on, price]) => ({ on, price })),
    from: 'stored',
    type: null,
    exchange: null,
    longName: null,
  }
}

async function fetchHistory(
  base: string,
  symbol: string,
  range: HistoryRange,
  doFetch: typeof fetch,
): Promise<PriceHistory | null> {
  try {
    const interval = range === '5y' ? '1wk' : '1d'
    const res = await doFetch(
      `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Hearthside)' },
      },
    )
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseChartHistory(await res.json())
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'warn', msg: 'price history failed', error: String(err) }),
    )
    return null
  }
}

/** For tests. */
export function clearHistoryCache() {
  historyCache.clear()
}
