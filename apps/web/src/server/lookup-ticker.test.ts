import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearHistoryCache, keyStats, lookupTicker } from './prices'

const source = 'https://quotes.test'

function chart(meta: Record<string, unknown>, closes: number[]) {
  return new Response(
    JSON.stringify({
      chart: {
        result: [
          {
            meta,
            timestamp: closes.map((_, i) => 1_700_000_000 + i * 86_400),
            indicators: { quote: [{ close: closes }] },
          },
        ],
        error: null,
      },
    }),
  )
}

afterEach(() => clearHistoryCache())

describe('lookupTicker', () => {
  it('returns the name, currency and last price, sending only the symbol', async () => {
    const fetch = vi.fn(async () =>
      chart({ currency: 'USD', longName: 'Test World Index Fund' }, [100, 101.5]),
    ) as unknown as typeof globalThis.fetch
    expect(await lookupTicker('TST1', { url: source, fetch })).toEqual({
      symbol: 'TST1',
      name: 'Test World Index Fund',
      currency: 'USD',
      price: '101.5',
    })
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toMatch(/\/v8\/finance\/chart\/TST1\?/)
    // A second look is served from the cache.
    await lookupTicker('TST1', { url: source, fetch })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('tries fund numbers on the local exchange, in agorot', async () => {
    const fetch = vi.fn(async () =>
      chart({ currency: 'ILA', shortName: 'Local fund' }, [12345]),
    ) as unknown as typeof globalThis.fetch
    expect(await lookupTicker('1234567', { url: source, fetch })).toMatchObject({
      currency: 'ILS',
      price: '123.45',
    })
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toContain('/1234567.TA?')
  })

  it('is null when the source is off or does not know it', async () => {
    expect(await lookupTicker('TST1', { url: null })).toBeNull()
    const fetch = vi.fn(
      async () => new Response('{}', { status: 404 }),
    ) as unknown as typeof globalThis.fetch
    expect(await lookupTicker('NOPE', { url: source, fetch })).toBeNull()
  })
})

describe('keyStats', () => {
  const fund = { symbol: 'TST1', currency: 'USD', quoteSymbol: null }
  const summary = {
    quoteSummary: {
      result: [{ price: { quoteType: 'ETF' }, summaryDetail: { trailingPE: { raw: 25 } } }],
      error: null,
    },
  }

  function source(opts: { refuseFirst?: boolean } = {}) {
    let refused = !opts.refuseFirst
    return vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const cookie = new Headers(init?.headers).get('cookie')
      if (url.startsWith('https://cookie.test'))
        return new Response('', { status: 404, headers: { 'set-cookie': 'A3=abc; Path=/' } })
      if (url.includes('/getcrumb'))
        return new Response(cookie === 'A3=abc' ? 'crumb1' : '', {
          status: cookie ? 200 : 401,
        })
      if (url.includes('/quoteSummary/')) {
        if (!refused) {
          refused = true
          return new Response('{}', { status: 401 })
        }
        expect(url).toContain('crumb=crumb1')
        expect(cookie).toBe('A3=abc')
        return new Response(JSON.stringify(summary))
      }
      return new Response('{}', { status: 500 })
    }) as unknown as typeof globalThis.fetch
  }
  const opts = (fetch: typeof globalThis.fetch) => ({
    url: 'https://quotes.test',
    cookieUrl: 'https://cookie.test',
    fetch,
  })

  it('gets a session, reads the summary and caches it for a day', async () => {
    const fetch = source()
    expect(await keyStats(fund, opts(fetch))).toMatchObject({ kind: 'fund', pe: 25 })
    const calls = vi.mocked(fetch).mock.calls.length
    await keyStats(fund, opts(fetch))
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
    // Only the symbol goes out.
    for (const [u] of vi.mocked(fetch).mock.calls) expect(String(u)).not.toMatch(/units|name/i)
  })

  it('asks for a new session when the old one is refused', async () => {
    const fetch = source({ refuseFirst: true })
    expect(await keyStats(fund, opts(fetch))).toMatchObject({ pe: 25 })
  })

  it('is null when the source is off or failing', async () => {
    expect(await keyStats(fund, { url: null })).toBeNull()
    const down = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof globalThis.fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await keyStats(fund, { ...opts(down) })).toBeNull()
  })
})
