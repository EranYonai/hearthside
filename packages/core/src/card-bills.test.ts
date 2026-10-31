import { describe, expect, it } from 'vitest'
import {
  billDifference,
  cardBillNote,
  cardBills,
  matchCardBills,
  type BankDebit,
  type CardCharge,
} from './card-bills'
import { cardPaymentProvider, isCardPayment } from './import/detect'

// Synthetic rows only.
const charge = (over: Partial<CardCharge> & Pick<CardCharge, 'amountMinor'>): CardCharge => ({
  accountId: 'card-a',
  provider: 'max',
  occurredOn: '2026-09-20',
  postedOn: '2026-10-10',
  batchId: 'b1',
  ...over,
})
const debit = (over: Partial<BankDebit> & Pick<BankDebit, 'id' | 'amountMinor'>): BankDebit => ({
  date: '2026-10-10',
  description: 'Payment',
  ...over,
})

describe('cardPaymentProvider', () => {
  it('names the card company a bank row pays', () => {
    expect(cardPaymentProvider('ISRACARD')).toBe('isracard')
    expect(cardPaymentProvider('ישראכרט בע"מ')).toBe('isracard')
    expect(cardPaymentProvider('כ.א.ל')).toBe('cal')
    expect(cardPaymentProvider('Max It Finance')).toBe('max')
    expect(cardPaymentProvider('כרטיסי אשראי')).toBeNull()
    expect(cardPaymentProvider('Rent')).toBeUndefined()
    expect(isCardPayment('diners club')).toBe(true)
    expect(isCardPayment('Coffee')).toBe(false)
  })
})

describe('cardBills', () => {
  it('adds up each card by billing date, refunds included', () => {
    const bills = cardBills([
      charge({ amountMinor: -10000 }),
      charge({ amountMinor: -5000 }),
      charge({ amountMinor: 2000 }),
      charge({ amountMinor: -700, postedOn: '2026-11-10' }),
    ])
    expect(bills.map((b) => [b.accountId, b.postedOn, b.expectedMinor])).toEqual([
      ['card-a', '2026-10-10', -13000],
      ['card-a', '2026-11-10', -700],
    ])
  })

  it('adds a company-wide bill when one company bills several cards together', () => {
    const bills = cardBills([
      charge({ amountMinor: -10000 }),
      charge({ amountMinor: -4000, accountId: 'card-b' }),
    ])
    expect(bills.map((b) => [b.accountId, b.expectedMinor])).toEqual([
      ['card-a', -10000],
      [null, -14000],
      ['card-b', -4000],
    ])
  })

  it('treats one import without billing dates as one bill', () => {
    const bills = cardBills([
      charge({ amountMinor: -3000, postedOn: null, occurredOn: '2026-09-02' }),
      charge({ amountMinor: -2000, postedOn: null, occurredOn: '2026-09-25' }),
      charge({ amountMinor: -1000, postedOn: null, batchId: 'b2', occurredOn: '2026-10-25' }),
    ])
    expect(bills.map((b) => [b.lastPurchase, b.expectedMinor])).toEqual([
      ['2026-09-25', -5000],
      ['2026-10-25', -1000],
    ])
  })

  it('skips bills that come to nothing or to a refund', () => {
    expect(cardBills([charge({ amountMinor: 500 })])).toEqual([])
  })
})

describe('matchCardBills', () => {
  it('matches a payment by amount and date, whatever its description says', () => {
    const result = matchCardBills(
      [debit({ id: 'd1', amountMinor: -15000, date: '2026-10-11', description: 'Transfer 123' })],
      [charge({ amountMinor: -10000 }), charge({ amountMinor: -5000 })],
    )
    expect(result.get('d1')).toEqual({ via: 'amount', accountId: 'card-a', expectedMinor: -15000 })
  })

  it('allows rounding but not a different amount or a far date', () => {
    const charges = [charge({ amountMinor: -15000 })]
    expect(matchCardBills([debit({ id: 'd', amountMinor: -15080 })], charges).get('d')?.via).toBe(
      'amount',
    )
    expect(matchCardBills([debit({ id: 'd', amountMinor: -15200 })], charges).size).toBe(0)
    expect(
      matchCardBills([debit({ id: 'd', amountMinor: -15000, date: '2026-10-20' })], charges).size,
    ).toBe(0)
  })

  it('matches a single payment for several cards of one company', () => {
    const result = matchCardBills(
      [debit({ id: 'd1', amountMinor: -14000 })],
      [charge({ amountMinor: -10000 }), charge({ amountMinor: -4000, accountId: 'card-b' })],
    )
    expect(result.get('d1')).toEqual({ via: 'amount', accountId: null, expectedMinor: -14000 })
  })

  it('pays each bill once, nearest date first', () => {
    const result = matchCardBills(
      [
        debit({ id: 'early', amountMinor: -5000, date: '2026-10-06' }),
        debit({ id: 'exact', amountMinor: -5000, date: '2026-10-10' }),
      ],
      [charge({ amountMinor: -5000 })],
    )
    expect(result.get('exact')?.via).toBe('amount')
    expect(result.has('early')).toBe(false)
  })

  it('matches by name and keeps the difference from the closest bill', () => {
    const result = matchCardBills(
      [debit({ id: 'd1', amountMinor: -16000, description: 'MAX IT' })],
      [
        charge({ amountMinor: -15000 }),
        charge({ amountMinor: -2000, provider: 'cal', accountId: 'c' }),
      ],
    )
    const match = result.get('d1')!
    expect(match).toEqual({ via: 'name', accountId: 'card-a', expectedMinor: -15000 })
    expect(billDifference(-16000, match.expectedMinor)).toBe(-1000)
  })

  it('matches by name with no card statement to compare against', () => {
    const result = matchCardBills([debit({ id: 'd1', amountMinor: -9000, description: 'כאל' })], [])
    expect(result.get('d1')).toEqual({ via: 'name', accountId: null, expectedMinor: null })
    expect(billDifference(-9000, null)).toBeNull()
  })

  it('matches a bill without a billing date within weeks of its last purchase', () => {
    const charges = [charge({ amountMinor: -5000, postedOn: null, occurredOn: '2026-09-25' })]
    expect(
      matchCardBills([debit({ id: 'd', amountMinor: -5000, date: '2026-10-02' })], charges).get('d')
        ?.via,
    ).toBe('amount')
    // Before the last purchase, it can't be paying this bill.
    expect(
      matchCardBills([debit({ id: 'd', amountMinor: -5000, date: '2026-09-20' })], charges).size,
    ).toBe(0)
  })

  it('leaves money coming in and other payments alone', () => {
    const result = matchCardBills(
      [
        debit({ id: 'in', amountMinor: 15000, description: 'ISRACARD refund' }),
        debit({ id: 'rent', amountMinor: -400000, description: 'Rent' }),
      ],
      [charge({ amountMinor: -15000 })],
    )
    expect(result.size).toBe(0)
  })
})

describe('cardBillNote', () => {
  it('names the card and flags a payment that disagrees with the statement', () => {
    expect(cardBillNote(-15000, -15000, 'Max ·1234')).toBe('Card bill · Max ·1234')
    expect(cardBillNote(-15050, -15000)).toBe('Card bill')
    expect(cardBillNote(-9000, null)).toBe('Card bill')
    expect(cardBillNote(-16000, -15000)).toBe('Card bill · ₪10.00 more than the card statement')
    expect(cardBillNote(-14000, -15000, 'Cal')).toBe(
      'Card bill · Cal · ₪10.00 less than the card statement',
    )
  })
})
