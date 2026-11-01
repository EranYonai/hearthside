import type { Minor } from './money'

/**
 * Loans paid back in equal monthly payments (a mortgage, a car loan, a personal loan).
 *
 * The balance follows the usual schedule: every month interest is added on what is still owed
 * and the payment is taken off. The first payment falls one month after the start date, on the
 * same day of the month. When someone types in the balance a lender reported, the schedule runs
 * from that balance instead, forward and back.
 */

export const LOAN_KINDS = [
  { slug: 'mortgage', label: 'Mortgage' },
  { slug: 'car', label: 'Car loan' },
  { slug: 'personal', label: 'Personal loan' },
  { slug: 'other', label: 'Other loan' },
] as const

export type LoanKind = (typeof LOAN_KINDS)[number]['slug']

export function isLoanKind(value: unknown): value is LoanKind {
  return LOAN_KINDS.some((k) => k.slug === value)
}

export function loanKindLabel(slug: string): string {
  return LOAN_KINDS.find((k) => k.slug === slug)?.label ?? 'Loan'
}

/** Longest term accepted: 50 years. */
export const MAX_TERM_MONTHS = 600

export interface LoanTerms {
  /** What was borrowed, positive. */
  principalMinor: Minor
  /** Yearly interest rate in percent, e.g. 4.5. */
  ratePercent: number
  termMonths: number
  /** When the money was lent, YYYY-MM-DD. */
  startOn: string
  /** The monthly payment, when known; otherwise worked out from the terms. */
  paymentMinor?: Minor | null
  /** A balance the lender reported, and the day it is from. */
  known?: { minor: Minor; on: string } | null
}

/** A yearly rate typed as "4.5" or "4.5%". Null when it isn't a rate between 0 and 50. */
export function parseRate(input: unknown): number | null {
  if (typeof input === 'number') return input >= 0 && input <= 50 ? input : null
  if (typeof input !== 'string') return null
  const text = input.trim().replace(/%$/, '').trim().replace(',', '.')
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(text)) return null
  const rate = Number(text)
  return rate <= 50 ? rate : null
}

const monthlyRate = (ratePercent: number) => ratePercent / 100 / 12

/** The equal monthly payment that pays `principal` off in `months`. */
export function monthlyPayment(principalMinor: Minor, ratePercent: number, months: number): Minor {
  if (months <= 0) return principalMinor
  const r = monthlyRate(ratePercent)
  if (r === 0) return Math.ceil(principalMinor / months)
  return Math.round((principalMinor * r) / (1 - (1 + r) ** -months))
}

/** The payment a loan's schedule uses. */
export function loanPayment(terms: LoanTerms): Minor {
  return terms.paymentMinor && terms.paymentMinor > 0
    ? terms.paymentMinor
    : monthlyPayment(terms.principalMinor, terms.ratePercent, terms.termMonths)
}

/** `start` moved on by `months`, keeping the day of the month where it can (31 Jan → 28 Feb). */
export function addMonths(start: string, months: number): string {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const first = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return first.toISOString().slice(0, 10)
}

/** The due dates of payments 1..termMonths. */
export function dueDates(startOn: string, termMonths: number): string[] {
  return Array.from({ length: Math.max(0, Math.min(termMonths, MAX_TERM_MONTHS)) }, (_, i) =>
    addMonths(startOn, i + 1),
  )
}

/** Interest and principal in one payment, from what was owed before it. */
export function splitPayment(
  balanceBeforeMinor: Minor,
  ratePercent: number,
  paymentMinor: Minor,
): { interestMinor: Minor; principalMinor: Minor } {
  const interestMinor = Math.max(0, Math.round(balanceBeforeMinor * monthlyRate(ratePercent)))
  const principalMinor = Math.max(0, Math.min(paymentMinor - interestMinor, balanceBeforeMinor))
  return { interestMinor, principalMinor }
}

const forward = (balance: Minor, ratePercent: number, payment: Minor) =>
  Math.max(0, balance - splitPayment(balance, ratePercent, payment).principalMinor)

const back = (balance: Minor, ratePercent: number, payment: Minor) =>
  Math.round((balance + payment) / (1 + monthlyRate(ratePercent)))

/** What is still owed at the end of `day`. Zero before the loan started and once it's paid off. */
export function loanBalanceOn(terms: LoanTerms, day: string): Minor {
  if (day < terms.startOn) return 0
  const payment = loanPayment(terms)
  const dates = dueDates(terms.startOn, terms.termMonths)
  const anchor =
    terms.known && terms.known.on >= terms.startOn
      ? terms.known
      : { minor: terms.principalMinor, on: terms.startOn }
  let balance = anchor.minor
  if (day >= anchor.on) {
    for (const due of dates)
      if (due > anchor.on && due <= day) balance = forward(balance, terms.ratePercent, payment)
    const last = dates.at(-1)
    // A schedule that ran its full term is done, whatever rounding left.
    return last && day >= last && balance < payment ? 0 : balance
  }
  for (const due of dates.toReversed())
    if (due > day && due <= anchor.on) balance = back(balance, terms.ratePercent, payment)
  return Math.min(balance, terms.principalMinor)
}

/** Payments left until `balance` is paid off, or null when the payment doesn't cover interest. */
export function monthsLeft(
  balanceMinor: Minor,
  ratePercent: number,
  paymentMinor: Minor,
): number | null {
  if (balanceMinor <= 0) return 0
  if (paymentMinor <= 0) return null
  const r = monthlyRate(ratePercent)
  if (r === 0) return Math.ceil(balanceMinor / paymentMinor)
  if (paymentMinor <= balanceMinor * r) return null
  // A last payment of a few cents (from rounding the payment) doesn't count as a month.
  return Math.ceil(-Math.log(1 - (balanceMinor * r) / paymentMinor) / Math.log(1 + r) - 0.01)
}

/** A bank payment towards a loan, split by the schedule. */
export interface LoanPaymentSplit {
  id: string
  on: string
  /** What left the bank, positive. */
  paidMinor: Minor
  interestMinor: Minor
  principalMinor: Minor
}

/**
 * Split each linked bank payment into interest and principal, using the schedule's balance just
 * before it. Interest comes off what the bank paid; the rest is principal.
 */
export function splitPayments(
  terms: LoanTerms,
  payments: readonly { id: string; on: string; minor: Minor }[],
): LoanPaymentSplit[] {
  return [...payments]
    .sort((a, b) => b.on.localeCompare(a.on))
    .map((p) => {
      const paidMinor = Math.abs(p.minor)
      const before = loanBalanceOn(terms, dayBefore(p.on))
      const { interestMinor } = splitPayment(before, terms.ratePercent, paidMinor)
      const interest = Math.min(interestMinor, paidMinor)
      return {
        id: p.id,
        on: p.on,
        paidMinor,
        interestMinor: interest,
        principalMinor: paidMinor - interest,
      }
    })
}

function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}
