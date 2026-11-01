import { describe, expect, it } from 'vitest'
import { categoryChanges, emptyFlow, sumFlows, yearMonths, type MonthFlow } from './cashflow'

const flow = (month: string, spent: number, received: number, byCategory = {}): MonthFlow => ({
  month,
  spent,
  received,
  byCategory,
})

describe('cashflow', () => {
  it('lists the months of a year', () => {
    const months = yearMonths(2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-01')
    expect(months[11]).toBe('2026-12')
  })

  it('sums money in, out and what is left', () => {
    expect(
      sumFlows([flow('2026-01', -300, 1000), emptyFlow('2026-02'), flow('2026-03', -900, 500)]),
    ).toEqual({ spent: -1200, received: 1500, left: 300, activeMonths: 2 })
    expect(sumFlows([])).toEqual({ spent: 0, received: 0, left: 0, activeMonths: 0 })
  })

  it('compares categories with the period before', () => {
    const now = [
      flow('2026-01', -150, 0, { groceries: -100, fun: -50 }),
      flow('2026-02', -100, 0, { groceries: -100 }),
    ]
    const before = [
      flow('2025-01', -80, 0, { groceries: -80 }),
      flow('2025-02', -70, 0, { groceries: -120, travel: -70 }),
    ]
    expect(categoryChanges(now, before)).toEqual([
      { category: 'groceries', minor: -200, previous: -200, months: [-100, -100], percent: 0 },
      { category: 'fun', minor: -50, previous: 0, months: [-50, 0], percent: null },
      { category: 'travel', minor: 0, previous: -70, months: [0, 0], percent: -100 },
    ])
  })

  it('reports growth as a positive percent', () => {
    const [row] = categoryChanges(
      [flow('2026-01', -150, 0, { '': -150 })],
      [flow('2025-01', -100, 0, { '': -100 })],
    )
    expect(row).toMatchObject({ category: '', percent: 50 })
  })
})
