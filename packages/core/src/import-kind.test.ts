import { describe, expect, it } from 'vitest'
import { parseHoldings } from './holdings-import'
import {
  UnknownFileError,
  classifyImport,
  detectBroker,
  mainCurrency,
  matchInvestmentAccount,
  suggestInvestmentName,
} from './import-kind'

// Synthetic layouts only; no real exports.
const sheet = (rows: string[][], name = 'S') => [{ name, rows }]

const holdingsRows = [
  ['Test Brokers LLC · Activity'],
  ['Account U7654321'],
  [],
  ['Symbol', 'Description', 'Quantity', 'Last Price', 'Currency', 'Market Value'],
  ['TSTA', 'Test World Index ETF', '12', '100', 'USD', '1200'],
  ['TSTB', 'Test Bond Fund', '3', '50', 'USD', '150'],
]

describe('classifyImport', () => {
  it('reads a card statement as a statement', () => {
    const kind = classifyImport(
      sheet([
        ['Date', 'Merchant', 'Amount'],
        ['01/09/2026', 'Test Bakery', '42.00'],
        ['02/09/2026', 'Test Grocer', '18.50'],
      ]),
    )
    expect(kind.type).toBe('statement')
    if (kind.type === 'statement') expect(kind.probe.transactions).toHaveLength(2)
  })

  it('reads a holdings export as holdings', () => {
    const kind = classifyImport(sheet(holdingsRows))
    expect(kind.type).toBe('holdings')
    if (kind.type === 'holdings') {
      expect(kind.holdings.holdings.map((h) => h.symbol)).toEqual(['TSTA', 'TSTB'])
      expect(kind.holdings.headerRow).toBe(4)
    }
  })

  it('prefers holdings when a holdings file also has a date column', () => {
    const kind = classifyImport(
      sheet([
        ['Date', 'Symbol', 'Security name', 'Quantity', 'Price', 'Value'],
        ['01/09/2026', 'TSTA', 'Test Fund A', '10', '5', '50'],
        ['01/09/2026', 'TSTB', 'Test Fund B', '20', '5', '100'],
      ]),
    )
    expect(kind.type).toBe('holdings')
  })

  it('reads Hebrew holdings headers', () => {
    const kind = classifyImport(
      sheet([
        ['שם נייר', 'מספר נייר', 'כמות', 'שער אחרון', 'שווי'],
        ['קרן לדוגמה', '1111111', '100', '1000', '1000'],
      ]),
    )
    expect(kind.type).toBe('holdings')
  })

  it('says so when a file is neither', () => {
    expect(() => classifyImport(sheet([['Hello'], ['World']]))).toThrow(UnknownFileError)
  })
})

describe('detectBroker', () => {
  it('finds the broker and account number above the table', () => {
    const rows = [['Interactive Brokers · Portfolio'], ...holdingsRows.slice(1)]
    const file = parseHoldings(sheet(rows), 'ILS')
    expect(detectBroker(sheet(rows), file, 'positions.csv')).toEqual({
      broker: 'ibkr',
      last4: '4321',
    })
  })

  it('reads the file name', () => {
    const file = parseHoldings(sheet(holdingsRows), 'ILS')
    expect(detectBroker(sheet(holdingsRows), file, 'meitav-holdings.xlsx').broker).toBe('meitav')
  })

  it('ignores houses named in fund names under the header', () => {
    const rows = [
      ['שם נייר', 'מספר נייר', 'כמות'],
      ['מיטב מחקה לדוגמה', '1111111', '10'],
      ['הראל מחקה לדוגמה', '2222222', '10'],
    ]
    const file = parseHoldings(sheet(rows), 'ILS')
    expect(detectBroker(sheet(rows), file, 'export.csv')).toEqual({ broker: null, last4: null })
  })

  it('reads a Hebrew account line', () => {
    const rows = [['פסגות'], ['חשבון: 123-456789'], ...holdingsRows.slice(3)]
    const file = parseHoldings(sheet(rows), 'ILS')
    expect(detectBroker(sheet(rows), file)).toEqual({ broker: 'psagot', last4: '6789' })
  })
})

describe('naming and matching', () => {
  it('names a new account after the broker', () => {
    expect(suggestInvestmentName({ broker: 'ibkr', last4: '4321' })).toBe(
      'Interactive Brokers ·4321',
    )
    expect(suggestInvestmentName({ broker: null, last4: null })).toBe('Investments')
  })

  it('takes the currency most holdings are in', () => {
    const file = parseHoldings(sheet(holdingsRows), 'ILS')
    expect(mainCurrency(file)).toBe('USD')
  })

  const accounts = [
    { id: 'a', name: 'Alex pension', provider: 'Harel' },
    { id: 'b', name: 'Interactive Brokers ·1111', provider: 'Interactive Brokers' },
    { id: 'c', name: 'Interactive Brokers ·4321', provider: 'Interactive Brokers' },
    { id: 'd', name: 'Savings', provider: null },
  ]

  it('matches the same broker and account number', () => {
    expect(matchInvestmentAccount(accounts, { broker: 'ibkr', last4: '4321' })?.id).toBe('c')
  })

  it('proposes a new account for a new account number', () => {
    expect(matchInvestmentAccount(accounts, { broker: 'ibkr', last4: '9999' })).toBeUndefined()
  })

  it('matches by broker when the file shows no number', () => {
    expect(matchInvestmentAccount(accounts, { broker: 'harel', last4: null })?.id).toBe('a')
    expect(matchInvestmentAccount(accounts, { broker: 'meitav', last4: null })).toBeUndefined()
  })

  it('matches an account without a known broker to a file without one', () => {
    expect(matchInvestmentAccount(accounts, { broker: null, last4: null })?.id).toBe('d')
  })

  it('reads the broker from the name when the provider is empty', () => {
    const named = [{ id: 'e', name: 'My eToro', provider: null }]
    expect(matchInvestmentAccount(named, { broker: 'etoro', last4: null })?.id).toBe('e')
  })
})
