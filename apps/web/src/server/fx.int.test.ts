import { randomBytes } from 'node:crypto'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentRates, FX_MAX_AGE_MS, fxSourceUrl, parseRates, refreshRates } from './fx'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

// Made-up rates in the service's shape. Tests never call the network.
const sample = (date: string, usd: number, ils: number) => ({
  amount: 1,
  base: 'EUR',
  date,
  rates: { USD: usd, ILS: ils },
})

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch
}

describe('parseRates', () => {
  it('keeps valid three-letter codes as exact decimals', () => {
    expect(
      parseRates({
        base: 'EUR',
        date: '2026-10-30',
        rates: { USD: 1.0812, ILS: 4, bad: 2, X: -1 },
      }),
    ).toEqual({ on: '2026-10-30', rates: { USD: '1.0812', ILS: '4' } })
  })

  it('rejects answers it does not understand', () => {
    for (const body of [
      null,
      { base: 'USD', date: '2026-10-30', rates: { ILS: 3 } },
      { base: 'EUR', date: 'yesterday', rates: { ILS: 3 } },
      { base: 'EUR', date: '2026-10-30' },
      { base: 'EUR', date: '2026-10-30', rates: { ILS: 0 } },
    ])
      expect(() => parseRates(body)).toThrow()
  })

  it('reads the source from the environment', () => {
    expect(fxSourceUrl({ FX_RATES_URL: 'off' })).toBeNull()
    expect(fxSourceUrl({ FX_RATES_URL: 'https://example.test/r' })).toBe('https://example.test/r')
    expect(fxSourceUrl({})).toMatch(/^https:\/\//)
    expect(fxSourceUrl({ FX_RATES_URL: '' })).toMatch(/^https:\/\//)
  })
})

describe.skipIf(!url)('exchange rates (Postgres)', () => {
  const source = 'https://rates.example.test/latest'

  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
    await initEncryption(db, [randomBytes(32)])
  })

  beforeEach(async () => {
    await db.execute(raw`truncate fx_rates`)
  })

  afterAll(async () => {
    await client?.sql.end()
  })

  it('stores a day of rates and updates it in place', async () => {
    await refreshRates(db, { url: source, fetch: fakeFetch(sample('2026-10-29', 1.25, 4)) })
    await refreshRates(db, { url: source, fetch: fakeFetch(sample('2026-10-29', 1.25, 4.1)) })
    await refreshRates(db, { url: source, fetch: fakeFetch(sample('2026-10-30', 1.2, 4.2)) })
    const rows = (await db.execute(raw`select count(*)::int as n from fx_rates`)) as unknown as {
      n: number
    }[]
    expect(rows[0]!.n).toBe(4)
    const { rates, on } = await currentRates(db, { url: null })
    expect(on).toBe('2026-10-30')
    expect(rates.get('USD/ILS')).toBeCloseTo(3.5)
  })

  it('fails loudly on a bad answer', async () => {
    await expect(refreshRates(db, { url: source, fetch: fakeFetch({}, 503) })).rejects.toThrow(
      'HTTP 503',
    )
  })

  it('waits for the first rates, then refreshes in the background when stale', async () => {
    const now = new Date('2026-10-31T08:00:00Z')
    const first = fakeFetch(sample('2026-10-30', 1.25, 4))
    const got = await currentRates(db, { url: source, fetch: first, now })
    expect(first).toHaveBeenCalledOnce()
    expect(got.rates.get('EUR/ILS')).toBe(4)

    // Fresh: no fetch.
    const none = fakeFetch(sample('2026-10-31', 1, 1))
    await currentRates(db, { url: source, fetch: none, now: new Date(now.getTime() + 1000) })
    expect(none).not.toHaveBeenCalled()

    // Stale: answers with what's stored and fetches once; a failure is only logged.
    const later = new Date(now.getTime() + FX_MAX_AGE_MS + 1000)
    const failing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stale = await currentRates(db, { url: source, fetch: failing, now: later })
    expect(stale.on).toBe('2026-10-30')
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce())
    expect(failing).toHaveBeenCalledOnce()
    warn.mockRestore()

    // With no source configured, nothing is fetched at all.
    expect((await currentRates(db, { url: null, now: later })).on).toBe('2026-10-30')
  })
})
