import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearLocalFunds, fundSource, localFund, localFunds } from './local-funds'
import { clearHistoryCache, lookupTicker } from './prices'

// Synthetic funds only.
const source = { url: 'https://funds.test', key: 'test-key' }
const answers: Record<string, unknown> = {
  '/v1/fund/fund-list': {
    funds: {
      result: [
        {
          fundId: '5100001',
          fundName: 'Test Fund A',
          fundLongName: 'Test House Broad Equity Fund',
          classificationMajor: { code: 1, value: 'Equity' },
          exposureProfile: '4D',
        },
      ],
    },
  },
  '/v1/fund/share-exposure-profile': {
    shareExposureProfile: { result: [{ code: 4, value: 'Up to 120%' }] },
  },
}

function fakeFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const path = new URL(String(url)).pathname
    return path in answers
      ? new Response(JSON.stringify(answers[path]))
      : new Response('{}', { status: 500 })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

afterEach(() => {
  clearLocalFunds()
  clearHistoryCache()
})

describe('fundSource', () => {
  it('needs a key, from a file or the environment', () => {
    expect(fundSource({})).toBeNull()
    expect(fundSource({ FUND_DATA_KEY: ' k ' })).toEqual({
      url: 'https://datawise.tase.co.il',
      key: 'k',
    })
    expect(fundSource({ FUND_DATA_KEY_FILE: '/x' }, () => 'from-file\n')?.key).toBe('from-file')
    expect(fundSource({ FUND_DATA_KEY_FILE: '/x' }, () => '\n')).toBeNull()
    expect(
      fundSource({ FUND_DATA_KEY_FILE: '/missing' }, () => {
        throw new Error('ENOENT')
      }),
    ).toBeNull()
    expect(fundSource({ FUND_DATA_KEY: 'k', FUND_DATA_URL: 'off' })).toBeNull()
  })
})

describe('localFund', () => {
  it('fetches the list once a day with the key, and finds the fund', async () => {
    const fetch = fakeFetch()
    const fund = await localFund({ symbol: '5100001', currency: 'ILS' }, { source, fetch })
    expect(fund).toMatchObject({ name: 'Test Fund A', shareExposure: 'Up to 120%' })
    const [, init] = fetch.mock.calls[0]!
    expect((init as RequestInit).headers).toMatchObject({ apikey: 'test-key' })
    // The request carries nothing about the holding.
    for (const [url] of fetch.mock.calls) expect(String(url)).not.toContain('5100001')
    const calls = fetch.mock.calls.length
    await localFund({ symbol: '5100001', currency: 'ILS' }, { source, fetch })
    expect(fetch).toHaveBeenCalledTimes(calls)
    // Only local fund numbers are looked up.
    expect(await localFund({ symbol: 'VTI', currency: 'USD' }, { source, fetch })).toBeNull()
    expect(await localFund({ symbol: '5100001', currency: 'USD' }, { source, fetch })).toBeNull()
  })

  it('is off without a key and quiet when the service fails', async () => {
    expect(await localFunds({ source: null })).toBeNull()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = vi.fn(async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    expect(await localFunds({ source, fetch: down })).toBeNull()
    expect(err.mock.calls.join(' ')).not.toContain('test-key')
    // Tried again after an hour, not on every page.
    await localFunds({ source, fetch: down })
    expect(down).toHaveBeenCalledTimes(3)
    err.mockRestore()
  })
})

describe('lookupTicker with local funds', () => {
  it('names a fund number the quote source does not know', async () => {
    const fetch = fakeFetch()
    expect(await lookupTicker('5100001', { url: null, fetch, funds: source })).toEqual({
      symbol: '5100001',
      name: 'Test House Broad Equity Fund',
      currency: 'ILS',
      price: null,
    })
    expect(await lookupTicker('5100009', { url: null, fetch, funds: source })).toBeNull()
  })
})
