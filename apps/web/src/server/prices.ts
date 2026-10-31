import { parseChartQuote, quoteIsDue, quoteSymbolFor, type Quote } from '@hearthside/core'
import type { Db } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, desc, eq } from 'drizzle-orm'

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
