import { readFileSync } from 'node:fs'
import { findLocalFund, parseCodeList, parseFundList, type LocalFund } from '@hearthside/core'

const FETCH_TIMEOUT_MS = 8000
const TTL_MS = 24 * 60 * 60 * 1000
const RETRY_MS = 60 * 60 * 1000

export interface FundSource {
  url: string
  key: string
}

/**
 * The local fund data service. It needs a key, read from FUND_DATA_KEY_FILE (a secret) or
 * FUND_DATA_KEY. No key, an empty key file, or FUND_DATA_URL=off turns it off.
 */
export function fundSource(
  env: Record<string, string | undefined> = process.env,
  readFile: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): FundSource | null {
  const url = env.FUND_DATA_URL || 'https://datawise.tase.co.il'
  if (url === 'off') return null
  let key = env.FUND_DATA_KEY ?? ''
  if (!key && env.FUND_DATA_KEY_FILE) {
    try {
      key = readFile(env.FUND_DATA_KEY_FILE)
    } catch {
      key = ''
    }
  }
  key = key.trim()
  return key ? { url: url.replace(/\/+$/, ''), key } : null
}

let cache: {
  at: number
  ttl: number
  source: string
  funds: Map<string, LocalFund> | null
} | null = null
let inFlight: Promise<Map<string, LocalFund> | null> | null = null

async function getJson(source: FundSource, path: string, doFetch: typeof fetch) {
  const res = await doFetch(`${source.url}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json', 'accept-language': 'en-US', apikey: source.key },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<unknown>
}

async function fetchFunds(source: FundSource, doFetch: typeof fetch) {
  const [list, shares, currencies] = await Promise.all([
    getJson(source, '/v1/fund/fund-list', doFetch),
    // The code lists only explain the exposure profile; the list is useful without them.
    getJson(source, '/v1/fund/share-exposure-profile', doFetch).catch(() => null),
    getJson(source, '/v1/fund/currency-exposure-profile', doFetch).catch(() => null),
  ])
  const codes = (body: unknown, name: string) => {
    try {
      return body ? parseCodeList(body, name) : undefined
    } catch {
      return undefined
    }
  }
  return parseFundList(list, {
    shares: codes(shares, 'shareExposureProfile'),
    currencies: codes(currencies, 'currencyExposureProfile'),
  })
}

/**
 * Every local fund the service lists, fetched as one list and kept for a day. Nothing about the
 * household is sent: the request is the same for everyone. Null when off or unreachable.
 */
export async function localFunds(
  options: { source?: FundSource | null; fetch?: typeof fetch; now?: Date } = {},
): Promise<Map<string, LocalFund> | null> {
  const source = options.source === undefined ? fundSource() : options.source
  if (!source) return null
  const now = (options.now ?? new Date()).getTime()
  if (cache && cache.source === source.url && now - cache.at < cache.ttl) return cache.funds
  inFlight ??= fetchFunds(source, options.fetch ?? fetch)
    .then((funds) => {
      cache = { at: now, ttl: TTL_MS, source: source.url, funds }
      return funds
    })
    .catch((err: unknown) => {
      // Never log the key; the error carries only the status.
      console.error(JSON.stringify({ level: 'warn', msg: 'fund data failed', error: String(err) }))
      cache = { at: now, ttl: RETRY_MS, source: source.url, funds: null }
      return null
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** What the fund data service knows about a local fund number, or null. */
export async function localFund(
  instrument: { symbol: string; currency: string },
  options: { source?: FundSource | null; fetch?: typeof fetch; now?: Date } = {},
): Promise<LocalFund | null> {
  if (instrument.currency !== 'ILS' || !/^\d+$/.test(instrument.symbol.trim())) return null
  const funds = await localFunds(options)
  return funds ? findLocalFund(funds, instrument.symbol) : null
}

/** For tests. */
export function clearLocalFunds() {
  cache = null
  inFlight = null
}
