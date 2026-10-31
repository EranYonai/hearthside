import { crossRates, parseDecimal, type Rates } from '@hearthside/core'
import type { Db } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { desc, sql } from 'drizzle-orm'
import type { Tx } from './repo'

const { fxRates } = schema

type Conn = Db | Tx

/** Reference rates are published once a working day; check for a new set this often. */
export const FX_MAX_AGE_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000
const BASE = 'EUR'

/**
 * Where reference rates come from. Defaults to a free public service that republishes the
 * European Central Bank's daily rates (no key needed). "off" never fetches (tests, offline).
 */
export function fxSourceUrl(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.FX_RATES_URL || 'https://api.frankfurter.dev/v1/latest?base=EUR'
  return url === 'off' ? null : url
}

export interface FetchedRates {
  on: string
  /** Units of each currency per one EUR, as exact decimal strings. */
  rates: Record<string, string>
}

/** Validate the service's answer: `{ base: "EUR", date: "YYYY-MM-DD", rates: { USD: 1.08 } }`. */
export function parseRates(body: unknown): FetchedRates {
  const b = body as { base?: unknown; date?: unknown; rates?: unknown }
  if (!b || typeof b !== 'object' || b.base !== BASE) throw new Error('fx: unexpected base')
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date))
    throw new Error('fx: missing date')
  if (!b.rates || typeof b.rates !== 'object') throw new Error('fx: missing rates')
  const rates: Record<string, string> = {}
  for (const [code, value] of Object.entries(b.rates as Record<string, unknown>)) {
    if (!/^[A-Z]{3}$/.test(code) || typeof value !== 'number' || !(value > 0)) continue
    const decimal = parseDecimal(value.toFixed(6))
    if (decimal && decimal !== '0') rates[code] = decimal
  }
  if (Object.keys(rates).length === 0) throw new Error('fx: no usable rates')
  return { on: b.date, rates }
}

/** Fetch the latest rates and store them. Returns how many pairs were written. */
export async function refreshRates(
  db: Conn,
  options: { url: string; fetch?: typeof fetch; now?: Date },
): Promise<number> {
  const doFetch = options.fetch ?? fetch
  const res = await doFetch(options.url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`fx: HTTP ${res.status}`)
  const { on, rates } = parseRates(await res.json())
  const fetchedAt = options.now ?? new Date()
  const source = new URL(options.url).hostname
  const rows = Object.entries(rates).map(([quote, rate]) => ({
    base: BASE,
    quote,
    on,
    rate,
    source,
    fetchedAt,
  }))
  await db
    .insert(fxRates)
    .values(rows)
    .onConflictDoUpdate({
      target: [fxRates.base, fxRates.quote, fxRates.on],
      set: { rate: sql`excluded.rate`, source: sql`excluded.source`, fetchedAt },
    })
  return rows.length
}

export interface StoredRates {
  rates: Rates
  /** The day the newest rates are for. */
  on: string | null
  fetchedAt: Date | null
}

/** The newest stored rate per currency, with every cross pair. */
export async function storedRates(db: Conn): Promise<StoredRates> {
  const rows = await db
    .selectDistinctOn([fxRates.quote])
    .from(fxRates)
    .where(sql`${fxRates.base} = ${BASE}`)
    .orderBy(fxRates.quote, desc(fxRates.on))
  const perBase: Record<string, number> = {}
  let on: string | null = null
  let fetchedAt: Date | null = null
  for (const r of rows) {
    perBase[r.quote] = Number(r.rate)
    if (!on || r.on > on) on = r.on
    if (!fetchedAt || r.fetchedAt > fetchedAt) fetchedAt = r.fetchedAt
  }
  return { rates: crossRates(BASE, perBase), on, fetchedAt }
}

let inFlight: Promise<unknown> | undefined

/**
 * Rates for a page. Uses what's stored; when that's older than FX_MAX_AGE_MS it refreshes in the
 * background (one refresh at a time), and waits only when nothing is stored yet. A failed
 * refresh is logged and the stored rates are used.
 */
export async function currentRates(
  db: Db,
  options: { url?: string | null; fetch?: typeof fetch; now?: Date } = {},
): Promise<StoredRates> {
  const url = options.url === undefined ? fxSourceUrl() : options.url
  const stored = await storedRates(db)
  const now = options.now ?? new Date()
  const stale = !stored.fetchedAt || now.getTime() - stored.fetchedAt.getTime() > FX_MAX_AGE_MS
  if (!url || !stale) return stored
  inFlight ??= refreshRates(db, { url, fetch: options.fetch, now })
    .catch((err: unknown) =>
      console.error(
        JSON.stringify({ level: 'warn', msg: 'exchange rate refresh failed', error: String(err) }),
      ),
    )
    .finally(() => {
      inFlight = undefined
    })
  if (stored.fetchedAt) return stored
  await inFlight
  return storedRates(db)
}
