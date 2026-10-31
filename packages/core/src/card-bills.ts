import { cardPaymentProvider } from './import/detect'
import { formatMoney, type Minor } from './money'

/**
 * Card bills paid from a bank account.
 *
 * Once a month the bank pays each card company the card's bill, which is the sum of the
 * purchases already listed on the card statement. Counting both would count that spending
 * twice. This matches each bank payment to the card bill it pays, so the payment can be left
 * out wherever the card purchases are counted, and keeps what the card statements add up to,
 * so a payment that doesn't agree with them can be flagged.
 */

/** A bank row that took money out. */
export interface BankDebit {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** Negative. */
  amountMinor: Minor
  description: string
}

/** A row on a card statement. */
export interface CardCharge {
  accountId: string
  /** The card company (see PROVIDERS), when known. */
  provider: string | null
  occurredOn: string
  /** When the card company bills it; rows without one are billed with the rest of their import. */
  postedOn: string | null
  /** The import the row came from. */
  batchId: string | null
  /** Negative for purchases, positive for refunds. */
  amountMinor: Minor
}

/** One card bill as the card statements add it up. */
export interface CardBill {
  /** The card account, or null for a bill that covers every card of one card company. */
  accountId: string | null
  provider: string | null
  /** The billing date, when the statement gives one. */
  postedOn: string | null
  /** Without a billing date: the last purchase on the bill. */
  lastPurchase: string
  /** What the bank should pay: negative, like the bank row. */
  expectedMinor: Minor
}

export type CardBillMatch = {
  /** amount: the bank paid exactly what a card bill adds up to. name: the description names a card company. */
  via: 'amount' | 'name'
  /** The card account paid, when it is a single one. */
  accountId: string | null
  /** The closest card bill's total, or null when no card statement covers it. */
  expectedMinor: Minor | null
}

/** Up to this much apart still counts as the same amount (rounding on foreign purchases). */
export const BILL_TOLERANCE_MINOR = 100
/** A bank payment lands within this many days of the billing date (weekends, holidays). */
const POSTED_WINDOW_DAYS = 5
/** Without a billing date, the payment comes within this many days of the last purchase. */
const OPEN_WINDOW_DAYS = 45

const DAY = 86_400_000
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY)

/** Add up card statements into the bills the bank is asked to pay. */
export function cardBills(charges: readonly CardCharge[]): CardBill[] {
  const bills = new Map<string, CardBill>()
  const add = (key: string, base: Omit<CardBill, 'expectedMinor'>, c: CardCharge) => {
    const bill = bills.get(key) ?? { ...base, expectedMinor: 0 }
    bill.expectedMinor += c.amountMinor
    if (!bill.postedOn && c.occurredOn > bill.lastPurchase) bill.lastPurchase = c.occurredOn
    bills.set(key, bill)
  }
  const byProvider = new Map<string, Set<string>>()
  for (const c of charges) {
    const when = c.postedOn ?? `batch:${c.batchId ?? 'none'}`
    const base = {
      provider: c.provider,
      postedOn: c.postedOn,
      lastPurchase: c.occurredOn,
    }
    add(`${c.accountId}|${when}`, { ...base, accountId: c.accountId }, c)
    // One card company often bills all of a person's cards in a single payment.
    if (c.provider && c.postedOn) {
      add(`${c.provider}|${c.postedOn}`, { ...base, accountId: null }, c)
      const accounts = byProvider.get(`${c.provider}|${c.postedOn}`) ?? new Set()
      byProvider.set(`${c.provider}|${c.postedOn}`, accounts.add(c.accountId))
    }
  }
  // A company-wide bill that covers a single card is the same as that card's bill.
  for (const [key, accounts] of byProvider) if (accounts.size < 2) bills.delete(key)
  return [...bills.values()].filter((b) => b.expectedMinor < 0)
}

/** Days between a bank payment and a bill, or undefined when the bill can't be the one. */
function distance(debit: BankDebit, bill: CardBill): number | undefined {
  if (bill.postedOn) {
    const d = Math.abs(days(bill.postedOn, debit.date))
    return d <= POSTED_WINDOW_DAYS ? d : undefined
  }
  const d = days(bill.lastPurchase, debit.date)
  return d >= 0 && d <= OPEN_WINDOW_DAYS ? d : undefined
}

/**
 * Match bank payments to card bills. A payment matches by amount when it pays what a bill
 * adds up to, near its billing date. Failing that, it matches by name when its description
 * names a card company, and records the closest bill from that company, if any, so the
 * difference can be shown. Each bill is paid once.
 */
export function matchCardBills(
  debits: readonly BankDebit[],
  charges: readonly CardCharge[],
): Map<string, CardBillMatch> {
  const bills = cardBills(charges)
  const used = new Set<CardBill>()
  const result = new Map<string, CardBillMatch>()
  const sorted = [...debits]
    .filter((d) => d.amountMinor < 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // Paying a company-wide bill pays each card on it, and the other way round.
  const take = (bill: CardBill) => {
    for (const b of bills)
      if (
        b === bill ||
        (b.postedOn &&
          b.postedOn === bill.postedOn &&
          b.provider === bill.provider &&
          (b.accountId === null || bill.accountId === null))
      )
        used.add(b)
  }

  const closest = (debit: BankDebit, fits: (bill: CardBill) => boolean) => {
    let best: { bill: CardBill; d: number } | undefined
    for (const bill of bills) {
      if (used.has(bill) || !fits(bill)) continue
      const d = distance(debit, bill)
      if (d === undefined) continue
      // Nearest date first, then a single card over a company-wide bill.
      if (!best || d < best.d || (d === best.d && best.bill.accountId === null && bill.accountId))
        best = { bill, d }
    }
    return best?.bill
  }

  // Exact amounts first, so a name match can't take a bill another payment pays exactly.
  // Closest dates pair up first; a single card wins a tie with a company-wide bill.
  const pairs: { debit: BankDebit; bill: CardBill; d: number }[] = []
  for (const debit of sorted)
    for (const bill of bills) {
      if (Math.abs(bill.expectedMinor - debit.amountMinor) > BILL_TOLERANCE_MINOR) continue
      const d = distance(debit, bill)
      if (d !== undefined) pairs.push({ debit, bill, d })
    }
  pairs.sort((x, y) => x.d - y.d || (x.bill.accountId ? 0 : 1) - (y.bill.accountId ? 0 : 1))
  for (const { debit, bill } of pairs) {
    if (used.has(bill) || result.has(debit.id)) continue
    take(bill)
    result.set(debit.id, {
      via: 'amount',
      accountId: bill.accountId,
      expectedMinor: bill.expectedMinor,
    })
  }
  for (const debit of sorted) {
    if (result.has(debit.id)) continue
    const provider = cardPaymentProvider(debit.description)
    if (provider === undefined) continue
    const bill = closest(debit, (b) => provider === null || b.provider === provider)
    if (bill) take(bill)
    result.set(debit.id, {
      via: 'name',
      accountId: bill?.accountId ?? null,
      expectedMinor: bill?.expectedMinor ?? null,
    })
  }
  return result
}

/** How much more (negative) or less (positive) the bank paid than the card bill. */
export function billDifference(paidMinor: Minor, expectedMinor: Minor | null): Minor | null {
  return expectedMinor === null ? null : paidMinor - expectedMinor
}

/**
 * A short note for a bank row that pays a card bill, e.g. "Card bill · Max ·1234" or
 * "Card bill · ₪100.00 more than the card statement".
 */
export function cardBillNote(
  paidMinor: Minor,
  expectedMinor: Minor | null,
  cardName?: string | null,
): string {
  const parts = ['Card bill']
  if (cardName) parts.push(cardName)
  const diff = billDifference(paidMinor, expectedMinor)
  if (diff !== null && Math.abs(diff) > BILL_TOLERANCE_MINOR)
    parts.push(
      `${formatMoney(Math.abs(diff))} ${diff < 0 ? 'more' : 'less'} than the card statement`,
    )
  return parts.join(' · ')
}
