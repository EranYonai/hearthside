import { describe, expect, it } from 'vitest'
import { closeTo, linkCandidates, matchLinks, rentSummary, type LinkRule } from './links'

const rules: LinkRule[] = [
  { id: 'rent', key: 'k-rent', expectedMinor: 500_000, direction: 'in' },
  { id: 'mortgage', key: 'k-loan', expectedMinor: 600_000, direction: 'out' },
  { id: 'car', key: 'k-loan', expectedMinor: 150_000, direction: 'out' },
  { id: 'any', key: 'k-any', expectedMinor: null, direction: 'out' },
]

describe('closeTo', () => {
  it('allows a quarter either way, and at least a unit', () => {
    expect(closeTo(-620_000, 600_000)).toBe(true)
    expect(closeTo(-760_000, 600_000)).toBe(false)
    expect(closeTo(150, 100)).toBe(true)
    expect(closeTo(5, null)).toBe(true)
  })
})

describe('matchLinks', () => {
  it('ties rows by description, direction and amount', () => {
    const m = matchLinks(
      [
        { id: '1', key: 'k-rent', amountMinor: 500_000 },
        { id: '2', key: 'k-rent', amountMinor: -500_000 }, // wrong way
        { id: '3', key: 'k-loan', amountMinor: -610_000 },
        { id: '4', key: 'k-loan', amountMinor: -151_000 },
        { id: '5', key: 'k-loan', amountMinor: -350_000 }, // neither loan
        { id: '6', key: 'other', amountMinor: 500_000 },
        { id: '7', key: 'k-any', amountMinor: -1 },
        { id: '8', key: 'k-rent', amountMinor: 0 },
      ],
      rules,
    )
    expect(Object.fromEntries(m)).toEqual({ '1': 'rent', '3': 'mortgage', '4': 'car', '7': 'any' })
  })
})

describe('linkCandidates', () => {
  it('offers rows going the right way, nearest the usual amount first', () => {
    const rows = [
      { id: 'a', amountMinor: 480_000, occurredOn: '2026-10-01' },
      { id: 'b', amountMinor: 900_000, occurredOn: '2026-10-02' },
      { id: 'c', amountMinor: -500_000, occurredOn: '2026-10-03' },
      { id: 'd', amountMinor: 500_000, occurredOn: '2026-09-01' },
    ]
    expect(linkCandidates(rows, 'in', 500_000).map((r) => r.id)).toEqual(['d', 'a', 'b'])
    expect(linkCandidates(rows, 'in', null).map((r) => r.id)).toEqual(['b', 'a', 'd'])
    expect(linkCandidates(rows, 'out', null).map((r) => r.id)).toEqual(['c'])
    expect(linkCandidates(rows, 'in', null, 1)).toHaveLength(1)
  })
})

describe('rentSummary', () => {
  it('averages the last year of rent and works out the yield', () => {
    // Monthly from Aug 2025 to Oct 2026; the last 12 months hold Nov 2025..Oct 2026.
    const rows = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(Date.UTC(2025, 7 + i, 5))
      return { on: d.toISOString().slice(0, 10), minor: 500_000 }
    })
    const s = rentSummary(rows, 200_000_000, '2026-10-31')
    expect(s.monthlyMinor).toBe(500_000)
    expect(s.yearMinor).toBe(6_000_000)
    expect(s.yieldPercent).toBeCloseTo(3)
    expect(s.lastOn).toBe('2026-10-05')
  })
  it('counts only the months since rent started', () => {
    const s = rentSummary(
      [
        { on: '2026-09-01', minor: 400_000 },
        { on: '2026-10-01', minor: 400_000 },
      ],
      null,
      '2026-10-31',
    )
    expect(s.monthlyMinor).toBe(400_000)
    expect(s.yieldPercent).toBeNull()
  })
  it('is empty without rent', () => {
    expect(rentSummary([], 100, '2026-10-31')).toEqual({
      monthlyMinor: 0,
      yearMinor: 0,
      yieldPercent: null,
      lastOn: null,
    })
  })
})
