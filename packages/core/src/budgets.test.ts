import { describe, expect, it } from 'vitest'
import {
  budgetMonth,
  budgetStatus,
  isBudgetable,
  monthElapsed,
  suggestLimits,
  tidyLimit,
} from './budgets'
import type { MonthFlow } from './cashflow'

const flow = (month: string, byCategory: Record<string, number>, received = 0): MonthFlow => ({
  month,
  received,
  spent: Object.values(byCategory).reduce((n, m) => n + m, 0),
  byCategory,
})

describe('budgetStatus', () => {
  it('turns amber at 80% and red over the limit', () => {
    expect(budgetStatus(7_999, 10_000)).toBe('ok')
    expect(budgetStatus(8_000, 10_000)).toBe('near')
    expect(budgetStatus(10_000, 10_000)).toBe('near')
    expect(budgetStatus(10_001, 10_000)).toBe('over')
    expect(budgetStatus(0, 0)).toBe('ok')
  })
})

describe('isBudgetable', () => {
  it('leaves out money in and moves between own accounts', () => {
    expect(isBudgetable('groceries')).toBe(true)
    expect(isBudgetable('c-abc')).toBe(true)
    for (const c of ['income', 'savings', 'transfer', '', null]) expect(isBudgetable(c)).toBe(false)
  })
})

describe('monthElapsed', () => {
  it('is whole for past months, none for future ones, and a share for this one', () => {
    expect(monthElapsed('2026-09', '2026-10-15')).toBe(1)
    expect(monthElapsed('2026-11', '2026-10-15')).toBe(0)
    expect(monthElapsed('2026-10', '2026-10-31')).toBe(1)
    expect(monthElapsed('2026-02', '2026-02-14')).toBe(0.5)
  })
})

describe('budgetMonth', () => {
  const limits = [
    { category: 'groceries', limitMinor: 200_000 },
    { category: 'eating-out', limitMinor: 50_000 },
    { category: 'kids', limitMinor: 100_000 },
    { category: 'travel', limitMinor: 0 },
  ]
  const month = budgetMonth(
    limits,
    flow('2026-10', { groceries: -170_000, 'eating-out': -60_000, shopping: -30_000, '': -5_000 }),
    '2026-10-20',
  )

  it('puts the categories closest to their limit first', () => {
    expect(month.lines.map((l) => [l.category, l.status])).toEqual([
      ['eating-out', 'over'],
      ['groceries', 'near'],
      ['kids', 'ok'],
    ])
    expect(month.lines[0]).toMatchObject({ spentMinor: 60_000, leftMinor: -10_000, share: 1.2 })
    expect(month.lines[2]).toMatchObject({ spentMinor: 0, leftMinor: 100_000, share: 0 })
  })

  it('totals the budgets and counts spending outside them', () => {
    expect(month).toMatchObject({
      limitMinor: 350_000,
      spentMinor: 230_000,
      leftMinor: 120_000,
      status: 'ok',
      outsideMinor: 35_000,
    })
    expect(month.elapsed).toBeCloseTo(20 / 31)
  })

  it('treats refunds above spending as nothing spent', () => {
    const refunded = budgetMonth(limits, flow('2026-10', { kids: 5_000 }), '2026-11-01')
    expect(refunded.lines.find((l) => l.category === 'kids')).toMatchObject({ spentMinor: 0 })
    expect(refunded.outsideMinor).toBe(0)
  })
})

describe('tidyLimit', () => {
  it('rounds up to tens, fifties or hundreds', () => {
    expect(tidyLimit(12_345)).toBe(13_000)
    expect(tidyLimit(123_401)).toBe(125_000)
    expect(tidyLimit(612_000)).toBe(620_000)
    expect(tidyLimit(0)).toBe(0)
  })
})

describe('suggestLimits', () => {
  it('averages active months only and skips money in and transfers', () => {
    const got = suggestLimits([
      flow('2026-07', {}),
      flow('2026-08', { groceries: -150_000, transfer: -90_000, kids: -20_000 }),
      flow('2026-09', { groceries: -170_000, 'c-pets': -10_000 }, 500_000),
    ])
    expect(got).toEqual([
      { category: 'groceries', limitMinor: 160_000 },
      { category: 'kids', limitMinor: 10_000 },
      { category: 'c-pets', limitMinor: 5_000 },
    ])
  })

  it('suggests nothing without history', () => {
    expect(suggestLimits([flow('2026-09', {})])).toEqual([])
  })
})
