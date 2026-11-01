import { describe, expect, it } from 'vitest'
import {
  addMonths,
  dueDates,
  isLoanKind,
  loanBalanceOn,
  loanKindLabel,
  loanPayment,
  monthlyPayment,
  monthsLeft,
  parseRate,
  splitPayment,
  splitPayments,
  type LoanTerms,
} from './loans'

const mortgage: LoanTerms = {
  principalMinor: 100_000_000, // 1,000,000.00
  ratePercent: 4.5,
  termMonths: 360,
  startOn: '2020-01-15',
}

describe('parseRate', () => {
  it('reads rates typed with or without a percent sign', () => {
    expect(parseRate('4.5')).toBe(4.5)
    expect(parseRate(' 3,25 % ')).toBe(3.25)
    expect(parseRate('0')).toBe(0)
    expect(parseRate(2)).toBe(2)
  })
  it('turns down anything that is not a sane rate', () => {
    for (const bad of ['', 'abc', '-1', '51', '4.12345', null, undefined, 99])
      expect(parseRate(bad)).toBeNull()
  })
})

describe('kinds', () => {
  it('knows its loan kinds', () => {
    expect(isLoanKind('mortgage')).toBe(true)
    expect(isLoanKind('boat')).toBe(false)
    expect(loanKindLabel('car')).toBe('Car loan')
    expect(loanKindLabel('x')).toBe('Loan')
  })
})

describe('monthlyPayment', () => {
  it('matches the standard annuity formula', () => {
    expect(monthlyPayment(100_000_000, 4.5, 360)).toBe(506_685)
  })
  it('splits evenly without interest', () => {
    expect(monthlyPayment(120_000, 0, 12)).toBe(10_000)
  })
  it('uses a typed payment over the schedule’s', () => {
    expect(loanPayment({ ...mortgage, paymentMinor: 600_000 })).toBe(600_000)
    expect(loanPayment(mortgage)).toBe(506_685)
  })
})

describe('dates', () => {
  it('keeps the day of the month where it can', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28')
    expect(addMonths('2025-11-15', 2)).toBe('2026-01-15')
    expect(addMonths('2025-03-15', -12)).toBe('2024-03-15')
  })
  it('lists the due dates from a month after the start', () => {
    expect(dueDates('2025-01-10', 3)).toEqual(['2025-02-10', '2025-03-10', '2025-04-10'])
  })
})

describe('loanBalanceOn', () => {
  it('is nothing before the loan and the full amount on its first day', () => {
    expect(loanBalanceOn(mortgage, '2019-12-31')).toBe(0)
    expect(loanBalanceOn(mortgage, '2020-01-15')).toBe(100_000_000)
  })
  it('goes down by the principal in each payment', () => {
    const first = splitPayment(100_000_000, 4.5, 506_685)
    expect(first.interestMinor).toBe(375_000)
    expect(loanBalanceOn(mortgage, '2020-02-14')).toBe(100_000_000)
    expect(loanBalanceOn(mortgage, '2020-02-15')).toBe(100_000_000 - first.principalMinor)
  })
  it('is paid off at the end of the term', () => {
    expect(loanBalanceOn(mortgage, '2050-01-15')).toBe(0)
    expect(loanBalanceOn(mortgage, '2060-01-01')).toBe(0)
  })
  it('follows a balance the lender reported, forward and back', () => {
    const known = { ...mortgage, known: { minor: 80_000_000, on: '2025-06-01' } }
    expect(loanBalanceOn(known, '2025-06-01')).toBe(80_000_000)
    const next = loanBalanceOn(known, '2025-06-15')
    expect(next).toBe(80_000_000 - splitPayment(80_000_000, 4.5, 506_685).principalMinor)
    // A month back is a little more than the reported balance, never more than was borrowed.
    const before = loanBalanceOn(known, '2025-05-14')
    expect(before).toBeGreaterThan(80_000_000)
    expect(before).toBeLessThan(80_600_000)
    expect(loanBalanceOn(known, '2020-01-20')).toBeLessThanOrEqual(100_000_000)
  })
  it('ignores a reported balance from before the start', () => {
    const odd = { ...mortgage, known: { minor: 5, on: '2019-01-01' } }
    expect(loanBalanceOn(odd, '2020-01-15')).toBe(100_000_000)
  })
})

describe('monthsLeft', () => {
  it('counts the payments left', () => {
    expect(monthsLeft(100_000_000, 4.5, 506_685)).toBe(360)
    expect(monthsLeft(120_000, 0, 10_000)).toBe(12)
    expect(monthsLeft(0, 4, 100)).toBe(0)
  })
  it('says when the payment doesn’t even cover interest', () => {
    expect(monthsLeft(100_000_000, 4.5, 300_000)).toBeNull()
    expect(monthsLeft(100, 4.5, 0)).toBeNull()
  })
})

describe('splitPayments', () => {
  it('splits each bank payment by the balance just before it, newest first', () => {
    const rows = splitPayments(mortgage, [
      { id: 'a', on: '2020-02-15', minor: -506_685 },
      { id: 'b', on: '2020-03-15', minor: -506_685 },
    ])
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
    const a = rows[1]!
    expect(a).toMatchObject({ paidMinor: 506_685, interestMinor: 375_000, principalMinor: 131_685 })
    expect(rows[0]!.interestMinor).toBeLessThan(375_000)
    for (const r of rows) expect(r.interestMinor + r.principalMinor).toBe(r.paidMinor)
  })
})
