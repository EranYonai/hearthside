import { describe, expect, it } from 'vitest'
import { NOT_FOUND_RETRY_MS, parseChartQuote, quoteIsDue, quoteSymbolFor } from './quotes'

// Made-up quotes in the source's shape.
const chart = (meta: Record<string, unknown>) => ({ chart: { result: [{ meta }], error: null } })

describe('quoteSymbolFor', () => {
  it('suffixes local numbers and keeps tickers', () => {
    expect(quoteSymbolFor('1234567', 'ILS')).toBe('1234567.TA')
    expect(quoteSymbolFor('1234567', 'USD')).toBe('1234567')
    expect(quoteSymbolFor('TST', 'USD')).toBe('TST')
    expect(quoteSymbolFor('TST', 'EUR', 'TST.DE')).toBe('TST.DE')
  })
})

describe('parseChartQuote', () => {
  it('reads price, time and previous close', () => {
    expect(
      parseChartQuote(
        chart({
          currency: 'USD',
          regularMarketPrice: 101.25,
          regularMarketTime: 1793400000,
          chartPreviousClose: 100,
        }),
      ),
    ).toEqual({
      price: '101.25',
      currency: 'USD',
      at: new Date(1793400000 * 1000),
      prevClose: '100',
    })
  })

  it('turns hundredths into main units', () => {
    const q = parseChartQuote(
      chart({
        currency: 'ILA',
        regularMarketPrice: 12345,
        regularMarketTime: 1,
        previousClose: 12000,
      }),
    )
    expect(q).toMatchObject({ price: '123.45', currency: 'ILS', prevClose: '120' })
    expect(
      parseChartQuote(chart({ currency: 'GBp', regularMarketPrice: 5, regularMarketTime: 1 })),
    ).toMatchObject({ price: '0.05', currency: 'GBP', prevClose: null })
  })

  it('returns null for unknown symbols and unusable quotes', () => {
    expect(parseChartQuote({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull()
    expect(parseChartQuote(chart({ currency: 'USD', regularMarketTime: 1 }))).toBeNull()
    expect(
      parseChartQuote(chart({ currency: 'USD', regularMarketPrice: 0, regularMarketTime: 1 })),
    ).toBeNull()
    expect(
      parseChartQuote(chart({ currency: '', regularMarketPrice: 1, regularMarketTime: 1 })),
    ).toBeNull()
    expect(parseChartQuote(chart({ currency: 'USD', regularMarketPrice: 1 }))).toBeNull()
  })

  it('throws on answers it does not understand', () => {
    expect(() => parseChartQuote(null)).toThrow()
    expect(() => parseChartQuote({ chart: { result: [] } })).toThrow()
  })
})

describe('quoteIsDue', () => {
  const now = new Date('2026-10-31T10:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)
  it('asks every 15 minutes, and daily for unknown symbols', () => {
    expect(quoteIsDue(null, null, now)).toBe(true)
    expect(quoteIsDue(ago(60_000), 'ok', now)).toBe(false)
    expect(quoteIsDue(ago(16 * 60_000), 'ok', now)).toBe(true)
    expect(quoteIsDue(ago(16 * 60_000), 'error', now)).toBe(true)
    expect(quoteIsDue(ago(60 * 60_000), 'not_found', now)).toBe(false)
    expect(quoteIsDue(ago(NOT_FOUND_RETRY_MS + 1), 'not_found', now)).toBe(true)
  })
})
