import { describe, expect, it } from 'vitest'
import {
  combineSeries,
  contributedBy,
  estimateHistory,
  historyDays,
  historyRangeFor,
  type Flow,
  isMovementKind,
  isTrendRange,
  movementLabel,
  movementSign,
  rangeStart,
  timeWeightedReturn,
  trendSeries,
  yearSummaries,
} from './trends'

const flow = (on: string, kind: Flow['kind'], amountMinor: number): Flow => ({
  on,
  kind,
  amountMinor,
})

describe('movement kinds', () => {
  it('knows its kinds, labels and signs', () => {
    expect(isMovementKind('deposit')).toBe(true)
    expect(isMovementKind('buy')).toBe(false)
    expect(movementLabel('fee')).toBe('Fee')
    expect(movementLabel('other')).toBe('other')
    expect(movementSign('withdrawal')).toBe(-1)
    expect(movementSign('dividend')).toBe(1)
  })
})

describe('rangeStart', () => {
  it('counts back whole months and clamps to short months', () => {
    expect(rangeStart('1m', '2026-10-31')).toBe('2026-09-30')
    expect(rangeStart('3m', '2026-05-31')).toBe('2026-02-28')
    expect(rangeStart('6m', '2026-10-15')).toBe('2026-04-15')
    expect(rangeStart('1y', '2028-02-29')).toBe('2027-02-28')
    expect(rangeStart('ytd', '2026-10-31')).toBe('2026-01-01')
    expect(rangeStart('all', '2026-10-31')).toBeNull()
    expect(isTrendRange('ytd')).toBe(true)
    expect(isTrendRange('2y')).toBe(false)
  })
})

describe('combineSeries', () => {
  it('carries each account forward over days it has no value', () => {
    expect(
      combineSeries([
        [
          { on: '2026-01-01', valueMinor: 100 },
          { on: '2026-01-03', valueMinor: 120 },
        ],
        [
          { on: '2026-01-02', valueMinor: 50 },
          { on: '2026-01-03', valueMinor: 40 },
        ],
      ]),
    ).toEqual([
      { on: '2026-01-01', valueMinor: 100 },
      { on: '2026-01-02', valueMinor: 150 },
      { on: '2026-01-03', valueMinor: 160 },
    ])
    expect(combineSeries([])).toEqual([])
  })
})

describe('contributedBy', () => {
  it('sums deposits less withdrawals, ignoring fees and income', () => {
    const flows = [
      flow('2026-01-05', 'withdrawal', -30),
      flow('2026-01-01', 'deposit', 100),
      flow('2026-01-02', 'fee', -5),
      flow('2026-01-02', 'dividend', 7),
    ]
    expect(contributedBy(flows, ['2025-12-31', '2026-01-01', '2026-01-04', '2026-01-05'])).toEqual([
      0, 100, 100, 70,
    ])
  })
})

describe('timeWeightedReturn', () => {
  it("doesn't count deposits as gains", () => {
    const points = [
      { on: '2026-01-01', valueMinor: 1000 },
      { on: '2026-02-01', valueMinor: 1100 }, // +10%
      { on: '2026-03-01', valueMinor: 2200 }, // 1000 deposited, then 1100 -> 1200 is +9.09%
    ]
    const r = timeWeightedReturn(points, [flow('2026-02-15', 'deposit', 1000)])
    expect(r).toBeCloseTo(1.1 * (1200 / 1100) - 1, 10)
  })

  it('needs a starting value', () => {
    expect(timeWeightedReturn([{ on: '2026-01-01', valueMinor: 5 }], [])).toBeNull()
    expect(
      timeWeightedReturn(
        [
          { on: '2026-01-01', valueMinor: 0 },
          { on: '2026-01-02', valueMinor: 100 },
        ],
        [flow('2026-01-02', 'deposit', 100)],
      ),
    ).toBeNull()
  })
})

describe('yearSummaries', () => {
  it('splits returns and money moved by year, newest first', () => {
    const points = [
      { on: '2025-06-01', valueMinor: 1000 },
      { on: '2025-12-31', valueMinor: 1200 },
      { on: '2026-06-01', valueMinor: 1800 },
    ]
    const flows = [
      flow('2025-03-01', 'deposit', 1000),
      flow('2026-02-01', 'deposit', 500),
      flow('2026-03-01', 'withdrawal', -100),
      flow('2026-04-01', 'fee', -10),
      flow('2026-04-01', 'tax', -2),
      flow('2026-05-01', 'dividend', 20),
      flow('2026-05-02', 'interest', 3),
    ]
    const [y2026, y2025] = yearSummaries(points, flows)
    expect(y2026).toMatchObject({
      year: 2026,
      deposits: 500,
      withdrawals: 100,
      fees: 12,
      income: 23,
    })
    // Starts from 31 Dec 2025: (1800 - 400) / 1200 - 1.
    expect(y2026!.returnRate).toBeCloseTo(1400 / 1200 - 1, 10)
    expect(y2025).toMatchObject({ year: 2025, deposits: 1000, withdrawals: 0 })
    expect(y2025!.returnRate).toBeCloseTo(0.2, 10)
  })
})

describe('trendSeries', () => {
  const points = [
    { on: '2026-01-10', valueMinor: 100 },
    { on: '2026-02-10', valueMinor: 110 },
    { on: '2026-03-10', valueMinor: 130 },
  ]
  const flows = [flow('2026-01-10', 'deposit', 100), flow('2026-03-01', 'deposit', 15)]

  it('starts a range from the last value before it', () => {
    expect(trendSeries(points, flows, '2026-02-15')).toEqual([
      { on: '2026-02-15', valueMinor: 110, contributedMinor: 100 },
      { on: '2026-03-10', valueMinor: 130, contributedMinor: 115 },
    ])
    expect(trendSeries(points, flows, '2026-02-10')[0]).toEqual({
      on: '2026-02-10',
      valueMinor: 110,
      contributedMinor: 100,
    })
  })

  it('covers all time without a start', () => {
    expect(trendSeries(points, flows, null)).toHaveLength(3)
    expect(trendSeries(points, flows, '2027-01-01')).toEqual([
      { on: '2027-01-01', valueMinor: 130, contributedMinor: 115 },
    ])
  })
})

describe('estimated history', () => {
  const fund = (points: { on: string; price: string }[], units = '10') => ({
    units,
    points,
    toDisplay: (minor: number) => minor * 2,
    nowMinor: 0,
  })

  it('collects the days with a close, inside the range and before recording began', () => {
    const a = fund([
      { on: '2026-01-02', price: '1' },
      { on: '2026-01-05', price: '1' },
    ])
    const b = fund([
      { on: '2026-01-03', price: '1' },
      { on: '2026-01-05', price: '1' },
      { on: '2026-01-09', price: '1' },
    ])
    expect(historyDays([a, b], '2026-01-03', '2026-01-09')).toEqual(['2026-01-03', '2026-01-05'])
    expect(historyDays([a, b], null, '2026-02-01')).toHaveLength(4)
  })

  it('values today’s holdings at past prices, cash at today’s value', () => {
    const a = fund([
      { on: '2026-01-02', price: '100' },
      { on: '2026-01-04', price: '110.5' },
    ])
    const cash = { units: '1', points: [], toDisplay: (m: number) => m, nowMinor: 500 }
    expect(estimateHistory([a, cash], ['2026-01-04', '2026-01-01', '2026-01-03'])).toEqual([
      // Before its first close a holding counts at that close.
      { on: '2026-01-01', valueMinor: 200000 + 500 },
      { on: '2026-01-03', valueMinor: 200000 + 500 },
      { on: '2026-01-04', valueMinor: 221000 + 500 },
    ])
  })

  it('maps trend ranges to price history ranges', () => {
    expect(historyRangeFor('1m')).toBe('1mo')
    expect(historyRangeFor('3m')).toBe('6mo')
    expect(historyRangeFor('ytd')).toBe('1y')
    expect(historyRangeFor('all')).toBe('5y')
  })
})
