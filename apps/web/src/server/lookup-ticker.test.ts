import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearHistoryCache, lookupTicker } from './prices'

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
