import { describe, expect, it } from 'vitest'
import { HoldingsFormatError, parseHoldings } from './holdings-import'
import { readTable } from './import'

// Synthetic layouts only; no real exports.
const sheet = (rows: string[][]) => [{ name: 'S', rows }]

describe('parseHoldings', () => {
  it('reads an English export with a title above the header', () => {
    const file = parseHoldings(
      sheet([
        ['Positions as of today'],
        [],
        ['Symbol', 'Description', 'Quantity', 'Last Price', 'Currency', 'Market Value'],
        ['TSTA', 'Test World Index ETF', '12.5', '100.20', 'USD', '1252.50'],
        ['TSTB', 'Test Treasury Bond Fund', '3', '50', 'USD', '150'],
        ['', '', '', '', '', ''],
        ['Total', '', '', '', '', '1402.50'],
      ]),
      'ILS',
    )
    expect(file.holdings).toEqual([
      {
        symbol: 'TSTA',
        name: 'Test World Index ETF',
        units: '12.5',
        price: '100.2',
        currency: 'USD',
        assetClass: 'global_stocks',
      },
      {
        symbol: 'TSTB',
        name: 'Test Treasury Bond Fund',
        units: '3',
        price: '50',
        currency: 'USD',
        assetClass: 'bonds',
      },
    ])
    expect(file.skipped).toEqual([])
    expect(file.priceInHundredths).toBe(false)
  })

  it('reads Hebrew headers and turns agorot prices into shekels', () => {
    const file = parseHoldings(
      sheet([
        ['שם נייר', 'מספר נייר', 'כמות', 'שער אחרון', 'שווי'],
        ['קרן מחקה לדוגמה', '1111111', '1,000', '15,230', '152,300'],
        ['קרן אג"ח לדוגמה', '2222222', '200', '9850', '19,700'],
        ['קרן בלי כמות', '3333333', '0', '100', '0'],
      ]),
      'ILS',
    )
    expect(file.priceInHundredths).toBe(true)
    expect(
      file.holdings.map((h) => [h.symbol, h.units, h.price, h.currency, h.assetClass]),
    ).toEqual([
      ['1111111', '1000', '152.3', 'ILS', 'local_stocks'],
      ['2222222', '200', '98.5', 'ILS', 'bonds'],
    ])
    expect(file.skipped).toEqual([{ row: 4, reason: 'No quantity' }])
  })

  it('works out a price from the value, and skips unknown currencies', () => {
    const file = parseHoldings(
      sheet([
        ['Ticker', 'Units', 'Value', 'Currency'],
        ['TSTC', '4', '400', 'EUR'],
        ['TSTD', '1', '5', 'XYZ'],
        ['THIS-SYMBOL-IS-FAR-TOO-LONG', '1', '5', 'USD'],
        ['', '1', '5', 'USD'],
      ]),
      'USD',
    )
    expect(file.holdings).toMatchObject([
      { symbol: 'TSTC', price: '100', currency: 'EUR', name: 'TSTC' },
    ])
    expect(file.skipped.map((s) => s.reason)).toEqual([
      'Unknown currency',
      'Symbol too long',
      'No symbol',
    ])
  })

  it('reads a CSV file end to end', () => {
    const csv = 'symbol,qty,price\nTSTA,2,10\n'
    const file = parseHoldings(readTable(new TextEncoder().encode(csv), 'h.csv'), 'USD')
    expect(file.holdings).toMatchObject([
      { symbol: 'TSTA', units: '2', price: '10', currency: 'USD' },
    ])
  })

  it('explains what it needs when it finds no table', () => {
    expect(() => parseHoldings(sheet([['Date', 'Amount']]), 'ILS')).toThrow(HoldingsFormatError)
    expect(() =>
      parseHoldings(
        sheet([
          ['Symbol', 'Quantity'],
          ['', ''],
        ]),
        'ILS',
      ),
    ).toThrow('No holdings found')
  })
})
