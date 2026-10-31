import { describe, expect, it } from 'vitest'
import {
  allocation,
  assetClassLabel,
  convertMinor,
  crossRates,
  decimalToMinor,
  isAssetClass,
  isHoldingCurrency,
  normalizeSymbol,
  parseDecimal,
  summarizePortfolio,
  valueMinor,
  type PricedHolding,
} from './invest'

describe('parseDecimal', () => {
  it('normalizes typed numbers', () => {
    expect(parseDecimal(' 1,234.50 ')).toBe('1234.5')
    expect(parseDecimal('007')).toBe('7')
    expect(parseDecimal('0.000100')).toBe('0.0001')
    expect(parseDecimal('12.000')).toBe('12')
    expect(parseDecimal(3.25)).toBe('3.25')
    expect(parseDecimal('0')).toBe('0')
  })

  it('rejects junk, negatives and exponents', () => {
    for (const bad of ['', '-1', '1e5', 'abc', '1.2.3', '.5', null, undefined, {}])
      expect(parseDecimal(bad)).toBeNull()
  })
})

describe('valueMinor', () => {
  it('multiplies exactly and rounds to minor units', () => {
    expect(valueMinor('10', '101.23')).toBe(101230)
    expect(valueMinor('0.5', '0.01')).toBe(1) // 0.005 rounds half up
    expect(valueMinor('3.3333', '3')).toBe(1000) // 9.9999
    expect(valueMinor('1234.567891', '98.7654')).toBe(12193259)
  })

  it('stays exact past float precision', () => {
    expect(valueMinor('123456789.123456', '1000.0001')).toBe(12345680146913)
  })

  it('turns a cash balance into minor units', () => {
    expect(decimalToMinor('12.345')).toBe(1235)
    expect(decimalToMinor('40')).toBe(4000)
  })
})

describe('convertMinor', () => {
  const rates = new Map([['USD/ILS', 3.7]])
  it('converts with direct and inverse rates', () => {
    expect(convertMinor(1000, 'USD', 'ILS', rates)).toBe(3700)
    expect(convertMinor(3700, 'ILS', 'USD', rates)).toBe(1000)
    expect(convertMinor(500, 'ILS', 'ILS', rates)).toBe(500)
  })
  it('returns null without a rate', () => {
    expect(convertMinor(100, 'EUR', 'ILS', rates)).toBeNull()
  })
})

describe('summarizePortfolio', () => {
  const holdings: PricedHolding[] = [
    { accountId: 'a', assetClass: 'global_stocks', currency: 'USD', valueMinor: 10000 },
    { accountId: 'a', assetClass: 'bonds', currency: 'ILS', valueMinor: 5000 },
    { accountId: 'b', assetClass: 'cash', currency: 'ILS', valueMinor: 1000 },
    { accountId: 'b', assetClass: 'global_stocks', currency: 'EUR', valueMinor: 700 },
    { accountId: 'b', assetClass: 'other', currency: 'ILS', valueMinor: null },
  ]

  it('converts what it can and sets the rest apart', () => {
    const s = summarizePortfolio(holdings, 'ILS', new Map([['USD/ILS', 3.5]]))
    expect(s.totalMinor).toBe(41000)
    expect(s.byClass).toEqual({ global_stocks: 35000, bonds: 5000, cash: 1000 })
    expect(s.byAccount).toEqual({ a: 40000, b: 1000 })
    expect(s.unconverted).toEqual({ EUR: 700 })
    expect(s.unpriced).toBe(1)
  })
})

describe('allocation', () => {
  it('gives whole percents that add up to 100, largest first', () => {
    const slices = allocation({ global_stocks: 1, bonds: 1, cash: 1 })
    expect(slices.map((s) => s.percent).reduce((a, b) => a + b)).toBe(100)
    expect(slices[0]!.percent).toBe(34)

    const mixed = allocation({ bonds: 19, global_stocks: 58, local_stocks: 16, cash: 7 })
    expect(mixed.map((s) => [s.slug, s.percent])).toEqual([
      ['global_stocks', 58],
      ['bonds', 19],
      ['local_stocks', 16],
      ['cash', 7],
    ])
  })

  it('is empty with nothing to split', () => {
    expect(allocation({})).toEqual([])
    expect(allocation({ bonds: 0 })).toEqual([])
  })
})

describe('helpers', () => {
  it('knows asset classes and currencies', () => {
    expect(isAssetClass('bonds')).toBe(true)
    expect(isAssetClass('crypto')).toBe(false)
    expect(assetClassLabel('local_stocks')).toBe('Local stocks')
    expect(isHoldingCurrency('USD')).toBe(true)
    expect(isHoldingCurrency('XYZ')).toBe(false)
  })

  it('normalizes symbols', () => {
    expect(normalizeSymbol('  vt ')).toBe('VT')
    expect(normalizeSymbol('11 2233')).toBe('112233')
  })
})

describe('crossRates', () => {
  it('derives every pair from one base', () => {
    const rates = crossRates('EUR', { USD: 1.25, ILS: 4 })
    expect(rates.get('EUR/ILS')).toBe(4)
    expect(rates.get('USD/ILS')).toBeCloseTo(3.2)
    expect(rates.get('ILS/EUR')).toBe(0.25)
    expect(convertMinor(1000, 'USD', 'ILS', rates)).toBe(3200)
    expect(rates.has('USD/USD')).toBe(false)
  })

  it('skips nonsense rates', () => {
    expect(crossRates('EUR', { USD: 0 }).size).toBe(0)
  })
})
