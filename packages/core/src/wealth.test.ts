import { describe, expect, it } from 'vitest'
import { balancesOn, changeOver, closingBalance, valuesOn, weeklyDays } from './wealth'

describe('closingBalance', () => {
  it('is null without a balance column', () => {
    expect(closingBalance([{ occurredOn: '2026-01-01' }])).toBeNull()
  })

  it('takes the last row of an oldest-first file', () => {
    expect(
      closingBalance([
        { occurredOn: '2026-01-01', balanceMinor: 100 },
        { occurredOn: '2026-01-03', balanceMinor: 250 },
        { occurredOn: '2026-01-03', balanceMinor: 200 },
      ]),
    ).toEqual({ minor: 200, on: '2026-01-03' })
  })

  it('takes the first row of a newest-first file', () => {
    expect(
      closingBalance([
        { occurredOn: '2026-01-05', balanceMinor: 900 },
        { occurredOn: '2026-01-02', balanceMinor: 700 },
        { occurredOn: '2026-01-01' },
      ]),
    ).toEqual({ minor: 900, on: '2026-01-05' })
  })

  it('reads negative balances', () => {
    expect(closingBalance([{ occurredOn: '2026-01-05', balanceMinor: -50 }])).toEqual({
      minor: -50,
      on: '2026-01-05',
    })
  })
})

describe('balancesOn', () => {
  const known = { minor: 1000, on: '2026-03-10' }
  const moves = [
    { on: '2026-03-01', minor: 500 },
    { on: '2026-03-05', minor: -200 },
    { on: '2026-03-10', minor: -100 },
    { on: '2026-03-20', minor: 9999 },
  ]

  it('works back through later money', () => {
    expect(balancesOn(known, moves, ['2026-02-28', '2026-03-04', '2026-03-09'])).toEqual([
      800, 1300, 1100,
    ])
  })

  it('keeps the known balance on and after its day', () => {
    expect(balancesOn(known, moves, ['2026-03-10', '2026-03-31'])).toEqual([1000, 1000])
  })
})

describe('valuesOn', () => {
  it('carries the latest value forward and starts at zero', () => {
    const points = [
      { on: '2026-01-10', valueMinor: 5 },
      { on: '2026-01-03', valueMinor: 3 },
    ]
    expect(valuesOn(points, ['2026-01-01', '2026-01-03', '2026-01-09', '2026-01-11'])).toEqual([
      0, 3, 3, 5,
    ])
    expect(valuesOn(points, ['2026-01-01'], { backfill: true })).toEqual([3])
    expect(valuesOn([], ['2026-01-01'], { backfill: true })).toEqual([0])
  })
})

describe('weeklyDays', () => {
  it('ends today, a week apart', () => {
    expect(weeklyDays('2026-03-15', 2)).toEqual(['2026-03-01', '2026-03-08', '2026-03-15'])
  })
})

describe('changeOver', () => {
  it('gives the change and share', () => {
    expect(changeOver([200, 150, 250])).toEqual({ minor: 50, percent: 25 })
  })

  it('has no share from zero or a single value', () => {
    expect(changeOver([0, 10])).toEqual({ minor: 10, percent: null })
    expect(changeOver([10])).toEqual({ minor: 0, percent: null })
  })
})
