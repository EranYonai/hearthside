import { describe, expect, it } from 'vitest'
import { findRecurring, type RecurringInput } from './recurring'

const row = (key: string, on: string, minor: number, category: string | null = null) =>
  ({ key, description: key.toUpperCase(), on, minor, category }) satisfies RecurringInput

const today = '2026-11-01'

describe('findRecurring', () => {
  it('finds a monthly payment and when the next one is due', () => {
    const [gym] = findRecurring(
      [
        row('gym', '2026-07-03', -12000),
        row('gym', '2026-08-03', -12000),
        row('gym', '2026-09-02', -12000),
        row('gym', '2026-10-03', -12000),
      ],
      today,
    )
    expect(gym).toMatchObject({
      key: 'gym',
      description: 'GYM',
      cadence: 'monthly',
      typicalMinor: -12000,
      lastOn: '2026-10-03',
      count: 4,
      changedPercent: null,
      monthlyMinor: -12000,
    })
    expect(gym!.nextOn).toBe('2026-11-03')
  })

  it('flags a price change', () => {
    const [tv] = findRecurring(
      [
        row('tv', '2026-07-10', -5000),
        row('tv', '2026-08-10', -5000),
        row('tv', '2026-09-10', -5000),
        row('tv', '2026-10-10', -5900),
      ],
      today,
    )
    expect(tv!.changedPercent).toBe(18)
    expect(tv!.lastMinor).toBe(-5900)
  })

  it('finds a yearly payment and spreads it over the months', () => {
    const [ins] = findRecurring(
      [row('ins', '2024-03-01', -120000), row('ins', '2025-03-02', -126000)],
      '2025-11-01',
    )
    expect(ins).toMatchObject({ cadence: 'yearly', monthlyMinor: -10250 })
  })

  it('leaves out one-offs, irregular shops, stopped payments, income and transfers', () => {
    const found = findRecurring(
      [
        // Twice a month apart is not enough for monthly.
        row('once', '2026-09-01', -1000),
        row('once', '2026-10-01', -1000),
        // Same shop, wildly different amounts.
        row('shop', '2026-07-01', -1000),
        row('shop', '2026-08-01', -9000),
        row('shop', '2026-09-01', -300),
        row('shop', '2026-10-01', -5000),
        // Stopped in the spring.
        row('old', '2026-01-05', -2000),
        row('old', '2026-02-05', -2000),
        row('old', '2026-03-05', -2000),
        // Money in.
        row('pay', '2026-08-01', 50000),
        row('pay', '2026-09-01', 50000),
        row('pay', '2026-10-01', 50000),
        // Moving money between our own accounts.
        row('move', '2026-08-01', -9000, 'transfer'),
        row('move', '2026-09-01', -9000, 'transfer'),
        row('move', '2026-10-01', -9000, 'transfer'),
      ],
      today,
    )
    expect(found).toEqual([])
  })

  it('merges payments in the same month and sorts by monthly cost', () => {
    const found = findRecurring(
      [
        row('phone', '2026-08-05', -3000),
        row('phone', '2026-09-05', -1000),
        row('phone', '2026-09-20', -2000),
        row('phone', '2026-10-05', -3000),
        row('rent', '2026-08-01', -500000),
        row('rent', '2026-09-01', -500000),
        row('rent', '2026-10-01', -500000),
      ],
      today,
    )
    expect(found.map((r) => [r.key, r.typicalMinor])).toEqual([
      ['rent', -500000],
      ['phone', -3000],
    ])
  })
})
