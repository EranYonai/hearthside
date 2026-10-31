import { randomBytes } from 'node:crypto'
import { QUOTE_MAX_AGE_MS } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInvestmentAccount,
  getHolding,
  listHoldings,
  portfolio,
  saveFundFacts,
  saveHolding,
} from './invest'
import {
  clearHistoryCache,
  keepQuotesFresh,
  priceHistory,
  quoteSourceUrl,
  refreshQuotes,
} from './prices'
import { AuthError, createHousehold } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']
const source = 'https://quotes.example.test'

// Made-up quotes in the source's shape, by symbol. Tests never call the network.
type Meta = Record<string, unknown>
function fakeSource(quotes: Record<string, Meta | 'down'>) {
  return vi.fn(async (input: string | URL | Request) => {
    const symbol = decodeURIComponent(String(input).split('/chart/')[1]!.split('?')[0]!)
    const q = quotes[symbol]
    if (q === 'down') return new Response('busy', { status: 503 })
    if (!q)
      return new Response(
        JSON.stringify({ chart: { result: null, error: { code: 'Not Found' } } }),
        {
          status: 404,
        },
      )
    return new Response(JSON.stringify({ chart: { result: [{ meta: q }], error: null } }))
  }) as unknown as typeof fetch
}

const t0 = new Date('2026-10-30T14:00:00Z')
const at = (d: Date) => Math.floor(d.getTime() / 1000)

describe('quoteSourceUrl', () => {
  it('reads the environment', () => {
    expect(quoteSourceUrl({ QUOTES_URL: 'off' })).toBeNull()
    expect(quoteSourceUrl({ QUOTES_URL: 'https://q.example.test/' })).toBe('https://q.example.test')
    expect(quoteSourceUrl({})).toMatch(/^https:\/\//)
  })
})

describe.skipIf(!url)('market prices (Postgres)', () => {
  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
    await initEncryption(db, [randomBytes(32)])
  })

  beforeEach(async () => {
    await db.execute(raw`truncate households, audit_log, auth_challenges cascade`)
  })

  afterAll(async () => {
    await client?.sql.end()
  })

  async function setup() {
    const { member } = await createHousehold(db, {
      householdName: 'Home',
      ownerName: 'Alex',
      passkey: {
        id: `prices-${Math.random()}`,
        publicKey: 'pk',
        counter: 0,
        transports: [],
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'Phone',
      },
    })
    const account = await createInvestmentAccount(db, member, {
      name: 'Test account',
      currency: 'USD',
      visibility: 'household',
    })
    const hold = (symbol: string, currency: string, units: string) =>
      saveHolding(db, member, account.id, {
        kind: 'security',
        symbol,
        name: `Test ${symbol}`,
        currency,
        assetClass: 'global_stocks',
        units,
      })
    await hold('TSTA', 'USD', '10')
    await hold('1234567', 'ILS', '100')
    await hold('NOSUCH', 'USD', '1')
    await hold('TSTB', 'USD', '2')
    await hold('TSTEUR', 'USD', '1')
    await saveHolding(db, member, account.id, { kind: 'cash', currency: 'USD', units: '5' })
    return { member: { ...member, displayCurrency: 'USD' } }
  }

  it('prices held securities, in main units, and marks what it could not find', async () => {
    const { member } = await setup()
    const fetch = fakeSource({
      TSTA: {
        currency: 'USD',
        regularMarketPrice: 101,
        regularMarketTime: at(t0),
        chartPreviousClose: 100,
      },
      '1234567.TA': { currency: 'ILA', regularMarketPrice: 15000, regularMarketTime: at(t0) },
      TSTB: 'down',
      TSTEUR: { currency: 'EUR', regularMarketPrice: 9, regularMarketTime: at(t0) },
    })
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = await refreshQuotes(db, { url: source, fetch, now: t0 })
    warn.mockRestore()
    expect(report).toEqual({ asked: 5, priced: 2, notFound: 2, failed: 1 })

    const list = await listHoldings(db, member)
    const by = Object.fromEntries(list.map((h) => [h.symbol, h]))
    expect(by.TSTA).toMatchObject({
      price: '101',
      priceSource: 'market',
      valueMinor: 101000,
      changeMinor: 1000,
    })
    expect(by['1234567']).toMatchObject({ price: '150', valueMinor: 1500000, changeMinor: null })
    expect(by.NOSUCH).toMatchObject({ price: null, quoteStatus: 'not_found' })
    expect(by.TSTB).toMatchObject({ price: null, quoteStatus: 'error' })
    // Quoted in another currency than the holding: left unpriced rather than read wrong.
    expect(by.TSTEUR).toMatchObject({ price: null, quoteStatus: 'not_found' })

    const p = await portfolio(db, member, new Map())
    expect(p.summary.changeMinor).toBe(1000)

    // A price typed in after the last close doesn't hide the market price.
    await saveHolding(
      db,
      member,
      by.TSTA!.accountId,
      {
        kind: 'security',
        symbol: 'TSTA',
        name: 'Test TSTA',
        currency: 'USD',
        assetClass: 'global_stocks',
        units: '10',
        price: '90',
      },
      new Date(t0.getTime() + 60_000),
    )
    expect((await listHoldings(db, member)).find((h) => h.symbol === 'TSTA')).toMatchObject({
      price: '101',
      priceSource: 'market',
    })
    // Until the source stops knowing it.
    await db.execute(
      raw`update instruments set quote_status = 'not_found' where id = ${by.TSTA!.instrumentId}`,
    )
    expect((await listHoldings(db, member)).find((h) => h.symbol === 'TSTA')).toMatchObject({
      price: '90',
      priceSource: 'manual',
    })
    await db.execute(
      raw`update instruments set quote_status = 'ok' where id = ${by.TSTA!.instrumentId}`,
    )

    // Within 15 minutes nothing is asked again; after, only what's due, and the same quote
    // time doesn't add a second price row.
    const again = fakeSource({
      TSTA: { currency: 'USD', regularMarketPrice: 101, regularMarketTime: at(t0) },
      TSTB: { currency: 'USD', regularMarketPrice: 50, regularMarketTime: at(t0) },
      '1234567.TA': { currency: 'ILA', regularMarketPrice: 15100, regularMarketTime: at(t0) + 60 },
    })
    expect(
      (await refreshQuotes(db, { url: source, fetch: again, now: new Date(t0.getTime() + 1000) }))
        .asked,
    ).toBe(0)
    const later = new Date(t0.getTime() + QUOTE_MAX_AGE_MS + 1000)
    // Unknown symbols wait a day.
    expect(await refreshQuotes(db, { url: source, fetch: again, now: later })).toEqual({
      asked: 3,
      priced: 3,
      notFound: 0,
      failed: 0,
    })
    const rows = (await db.execute(
      raw`select count(*)::int as n from instrument_prices where source = 'market'`,
    )) as unknown as { n: number }[]
    expect(rows[0]!.n).toBe(4)
  })

  it('waits on first sight of a security, then refreshes in the background', async () => {
    await setup()
    const fetch = fakeSource({
      TSTA: { currency: 'USD', regularMarketPrice: 1, regularMarketTime: at(t0) },
    })
    await keepQuotesFresh(db, { url: source, fetch, now: t0 })
    expect(fetch).toHaveBeenCalledTimes(5)
    await keepQuotesFresh(db, { url: source, fetch, now: new Date(t0.getTime() + 1000) })
    expect(fetch).toHaveBeenCalledTimes(5)
    const later = new Date(t0.getTime() + QUOTE_MAX_AGE_MS + 1000)
    await keepQuotesFresh(db, { url: source, fetch, now: later })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(6))
    await keepQuotesFresh(db, { url: null })
  })

  it('reads price history from the source, or from prices stored here', async () => {
    const { member } = await createHousehold(db, {
      householdName: 'Home',
      ownerName: 'Alex',
      passkey: {
        id: `history-${Math.random()}`,
        publicKey: 'pk',
        counter: 0,
        transports: [],
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'Phone',
      },
    })
    const account = await createInvestmentAccount(db, member, {
      name: 'Test account',
      currency: 'USD',
      visibility: 'household',
    })
    const holding = await saveHolding(db, member, account.id, {
      kind: 'security',
      symbol: 'TSTH',
      name: 'Test history fund',
      currency: 'USD',
      assetClass: 'global_stocks',
      units: '1',
      price: '10',
    })
    const { holding: h } = await getHolding(db, member, holding.id)
    const instrument = { ...h, id: h.instrumentId }
    const day = (on: string) => Date.parse(`${on}T20:00:00Z`) / 1000
    const fetch = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain('/chart/TSTH?interval=1wk&range=5y')
      return new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: { currency: 'USD', instrumentType: 'ETF', exchangeName: 'TST' },
                timestamp: [day('2026-01-02'), day('2026-01-09')],
                indicators: { quote: [{ close: [9.5, 10.25] }] },
              },
            ],
            error: null,
          },
        }),
      )
    }) as unknown as typeof globalThis.fetch
    clearHistoryCache()
    const fromSource = await priceHistory(db, instrument, '5y', { url: source, fetch, now: t0 })
    expect(fromSource).toMatchObject({ from: 'source', type: 'ETF', exchange: 'TST' })
    expect(fromSource.points).toEqual([
      { on: '2026-01-02', price: '9.5' },
      { on: '2026-01-09', price: '10.25' },
    ])
    // Cached for an hour.
    await priceHistory(db, instrument, '5y', { url: source, fetch, now: t0 })
    expect(fetch).toHaveBeenCalledTimes(1)

    // Off, or not known to the source: the last stored price per day.
    const stored = await priceHistory(db, instrument, '1mo', { url: null })
    expect(stored.from).toBe('stored')
    expect(stored.points.map((p) => p.price)).toEqual(['10'])
    const unknown = await priceHistory(db, instrument, '1y', {
      url: source,
      fetch: fakeSource({}),
      now: t0,
    })
    expect(unknown.from).toBe('stored')
  })

  it('keeps fund facts for whoever manages the account', async () => {
    const { member } = await createHousehold(db, {
      householdName: 'Home',
      ownerName: 'Alex',
      passkey: {
        id: `facts-${Math.random()}`,
        publicKey: 'pk',
        counter: 0,
        transports: [],
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'Phone',
      },
    })
    const account = await createInvestmentAccount(db, member, {
      name: 'Test account',
      currency: 'USD',
      visibility: 'household',
    })
    const fund = await saveHolding(db, member, account.id, {
      kind: 'security',
      symbol: 'TSTF',
      name: 'Test facts fund',
      currency: 'USD',
      assetClass: 'global_stocks',
      units: '1',
    })
    const cash = await saveHolding(db, member, account.id, {
      kind: 'cash',
      currency: 'USD',
      units: '1',
    })
    const facts = await saveFundFacts(db, member, fund.id, {
      fee: '0.2',
      index: 'A test index',
      documents: [{ label: 'Key facts', url: 'https://example.com/kf.pdf' }],
    })
    expect((await getHolding(db, member, fund.id)).holding.facts).toEqual(facts)
    const [row] = (await db.execute(
      raw`select facts from instruments where symbol_key is not null and facts is not null`,
    )) as unknown as { facts: string }[]
    expect(row!.facts).not.toContain('example.com')
    await expect(saveFundFacts(db, member, fund.id, { fee: 'lots' })).rejects.toThrow(AuthError)
    await expect(saveFundFacts(db, member, cash.id, {})).rejects.toThrow(AuthError)
    await expect(getHolding(db, member, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      AuthError,
    )
  })
})
