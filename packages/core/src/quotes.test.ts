import { describe, expect, it } from 'vitest'
import {
  cleanFundFacts,
  FundFactsError,
  isHistoryRange,
  NOT_FOUND_RETRY_MS,
  parseChartHistory,
  parseChartQuote,
  quoteIsDue,
  quoteSymbolFor,
} from './quotes'

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

describe('parseChartHistory', () => {
  const day = (on: string) => Date.parse(`${on}T14:30:00Z`) / 1000
  it('reads daily closes, skipping gaps and converting subunits', () => {
    const h = parseChartHistory({
      chart: {
        result: [
          {
            meta: {
              currency: 'ILA',
              instrumentType: 'ETF',
              exchangeName: 'TLV',
              longName: ' Test Fund ',
            },
            timestamp: [day('2026-01-02'), day('2026-01-01'), day('2026-01-03'), 'x'],
            indicators: { quote: [{ close: [1250, 1200, null, 5] }] },
          },
        ],
        error: null,
      },
    })
    expect(h).toEqual({
      currency: 'ILS',
      points: [
        { on: '2026-01-01', price: '12' },
        { on: '2026-01-02', price: '12.5' },
      ],
      type: 'ETF',
      exchange: 'TLV',
      longName: 'Test Fund',
    })
  })

  it('knows unknown symbols and odd answers apart', () => {
    expect(parseChartHistory({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull()
    expect(parseChartHistory({ chart: { result: [{ meta: { currency: '' } }] } })).toBeNull()
    expect(
      parseChartHistory({ chart: { result: [{ meta: { currency: 'USD' } }], error: null } }),
    ).toMatchObject({ points: [], type: null, exchange: null, longName: null })
    expect(() => parseChartHistory({})).toThrow()
    expect(() => parseChartHistory({ chart: { result: [] } })).toThrow()
    expect(isHistoryRange('1y')).toBe(true)
    expect(isHistoryRange('max')).toBe(false)
  })
})

describe('cleanFundFacts', () => {
  it('keeps what makes sense', () => {
    expect(
      cleanFundFacts({
        fee: ' 0.07 % ',
        index: '  A   world index ',
        domicile: '',
        documents: [
          { label: 'Prospectus', url: 'https://example.com/p.pdf' },
          { label: '', url: 'https://docs.example.org/kid' },
          { label: 'blank', url: '' },
        ],
      }),
    ).toEqual({
      fee: '0.07',
      index: 'A world index',
      domicile: null,
      documents: [
        { label: 'Prospectus', url: 'https://example.com/p.pdf' },
        { label: 'docs.example.org', url: 'https://docs.example.org/kid' },
      ],
    })
    expect(cleanFundFacts({})).toEqual({ fee: null, index: null, domicile: null, documents: [] })
  })

  it('refuses what does not', () => {
    for (const bad of [
      { fee: 'cheap' },
      { fee: '12' },
      { index: 'x'.repeat(81) },
      { documents: [{ url: 'http://example.com' }] },
      { documents: [{ url: 'javascript:alert(1)' }] },
      { documents: [{ url: 'not a link' }] },
      { documents: Array.from({ length: 6 }, () => ({ url: 'https://example.com' })) },
    ])
      expect(() => cleanFundFacts(bad)).toThrow(FundFactsError)
  })
})
