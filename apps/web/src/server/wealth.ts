import {
  accountLook,
  balancesOn,
  changeOver,
  convertMinor,
  type Minor,
  type Rates,
  chartDays,
  valuesOn,
  type WealthRange,
  wealthRangeStart,
} from '@hearthside/core'
import { type MemberRow, schema } from '@hearthside/db'
import { and, gt, inArray, min } from 'drizzle-orm'
import { portfolio } from './invest'
import { listAccounts } from './ledger'
import { debtsAndProperty, loanBalanceOnDay, propertyValueOn } from './loans'
import type { Tx } from './repo'
import { dayOf, trends } from './trends'

const { transactions } = schema

type Conn = Parameters<typeof listAccounts>[0] | Tx

export interface WealthPart {
  key: string
  name: string
  provider: string | null
  kind: 'cash' | 'invest' | 'property' | 'loan'
  /** The account's color (#RRGGBB), or null for a neutral one. */
  color: string | null
  /** In the wealth currency. */
  minor: Minor
  href: string
}

export interface WealthPoint {
  on: string
  /** What we own minus what we owe. */
  totalMinor: Minor
  investedMinor: Minor
  owedMinor: Minor
}

export interface Wealth {
  currency: string
  /** Net worth: everything owned minus loans still owed. */
  totalMinor: Minor
  cashMinor: Minor
  investedMinor: Minor
  /** Real estate at its typed value. */
  propertyMinor: Minor
  /** Cash, investments and property together. */
  ownMinor: Minor
  /** Loans still owed, positive. */
  owedMinor: Minor
  /** Each account's or property's share, largest first. */
  parts: WealthPart[]
  /** Each loan's balance (positive), largest first. */
  owed: WealthPart[]
  /** Bank accounts with no known balance, left out of the total. */
  missing: { id: string; name: string }[]
  /** Currencies with no rate to `currency`; those amounts are left out. */
  unconverted: string[]
  range: WealthRange
  /**
   * The chart's points over `range`, oldest first: daily up to two weeks, weekly up to a year,
   * then monthly. It starts later than the range when the household's data does. Empty when
   * there's nothing to draw.
   */
  series: WealthPoint[]
  /** The day the series starts when that's later than the range's start, else null. */
  since: string | null
  /** Change from the first point of the series to today. */
  change: { minor: Minor; percent: number | null }
  /** True when anything is counted at all. */
  any: boolean
}

/**
 * What the household owns, as the member sees it: bank balances, investments and property, less
 * loans still owed, in the member's display currency. Past weeks work bank balances back through the transactions since, and take
 * investments from their recorded values.
 */
export async function wealth(
  db: Conn,
  member: MemberRow,
  rates: Rates,
  now = new Date(),
  range: WealthRange = '6m',
): Promise<Wealth> {
  const [banks, invest] = await Promise.all([
    listAccounts(db, member).then((list) => list.filter((a) => a.kind === 'bank')),
    portfolio(db, member, rates),
  ])
  const currency = invest.summary.currency
  const estate = await debtsAndProperty(db, member, currency, rates, now)
  const unconverted = new Set(Object.keys(invest.summary.unconverted))
  const parts: WealthPart[] = []
  const missing: Wealth['missing'] = []
  const known: { id: string; minor: Minor; on: string }[] = []

  for (const a of banks) {
    if (a.balanceMinor === null || !a.balanceOn) {
      missing.push({ id: a.id, name: a.name })
      continue
    }
    const minor = convertMinor(a.balanceMinor, 'ILS', currency, rates)
    if (minor === null) {
      unconverted.add('ILS')
      continue
    }
    known.push({ id: a.id, minor: a.balanceMinor, on: a.balanceOn })
    parts.push({
      key: a.id,
      name: a.name,
      provider: a.provider,
      kind: 'cash',
      color: accountLook(a).color,
      minor,
      href: `/accounts/${a.id}`,
    })
  }
  for (const a of invest.accounts) {
    const minor = invest.summary.byAccount[a.id] ?? 0
    parts.push({
      key: a.id,
      name: a.name,
      provider: a.provider,
      kind: 'invest',
      color: accountLook(a).color,
      minor,
      href: `/invest/${a.id}`,
    })
  }
  for (const p of estate.properties) {
    if (p.minor === null) {
      unconverted.add(p.row.currency)
      continue
    }
    parts.push({
      key: p.row.id,
      name: p.row.name,
      provider: null,
      kind: 'property',
      color: null,
      minor: p.minor,
      href: `/invest/property/${p.row.id}`,
    })
  }
  const owed: WealthPart[] = []
  for (const l of estate.loans) {
    if (l.minor === null) {
      unconverted.add(l.loan.currency)
      continue
    }
    if (l.minor <= 0) continue
    owed.push({
      key: l.loan.id,
      name: l.loan.name,
      provider: l.loan.lender,
      kind: 'loan',
      color: null,
      minor: l.minor,
      href: `/invest/loan/${l.loan.id}`,
    })
  }
  parts.sort((a, b) => b.minor - a.minor)
  owed.sort((a, b) => b.minor - a.minor)
  const cashMinor = parts.filter((p) => p.kind === 'cash').reduce((n, p) => n + p.minor, 0)
  const propertyMinor = parts.filter((p) => p.kind === 'property').reduce((n, p) => n + p.minor, 0)
  const owedMinor = owed.reduce((n, p) => n + p.minor, 0)
  const investedMinor = invest.summary.totalMinor
  const ownMinor = cashMinor + investedMinor + propertyMinor
  const any =
    known.length > 0 ||
    unconverted.size > 0 ||
    invest.accounts.length > 0 ||
    estate.properties.length > 0 ||
    estate.loans.length > 0

  let series: WealthPoint[] = []
  let since: string | null = null
  if (any) {
    const today = dayOf(now)
    // Ask for more investment history than the range, so a later first point means data starts late.
    const trendRange = range === '1d' || range === '1w' ? '1m' : range === '6m' ? '1y' : 'all'
    const history =
      invest.accounts.length > 0
        ? await trends(db, member, trendRange, rates, now, { currency })
        : null
    const rangeStart = wealthRangeStart(range, today)
    // Days before any data starts would only repeat the first value, so the chart and its change
    // start where the earliest data does.
    const dataStart = [
      known.length > 0 ? await firstCashDay(db, known) : null,
      history ? (history.series[0]?.on ?? today) : null,
    ]
      .filter((d): d is string => !!d)
      .sort()[0]
    const start = dataStart && dataStart > rangeStart ? dataStart : rangeStart
    if (start > rangeStart) since = start < today ? start : null
    const days = chartDays(today, start)
    const [cash, invested] = await Promise.all([
      cashHistory(db, known, days, (m) => convertMinor(m, 'ILS', currency, rates) ?? 0),
      history
        ? // Accounts were held before their first recorded value; carry it back. With no history
          // at all, today's value is the best guess for the past too.
          valuesOn(
            history.series.length > 0
              ? history.series.map((p) => ({ on: p.on, valueMinor: p.valueMinor }))
              : [{ on: today, valueMinor: investedMinor }],
            days,
            { backfill: true },
          )
        : days.map(() => 0),
    ])
    const convert = (minor: Minor, from: string) => convertMinor(minor, from, currency, rates) ?? 0
    series = days.map((on, i) => {
      const estateMinor = estate.properties.reduce(
        (n, p) => n + convert(propertyValueOn(p.row, on), p.row.currency),
        0,
      )
      const owedOn = estate.loans.reduce(
        (n, l) => n + convert(loanBalanceOnDay(l.loan, on), l.loan.currency),
        0,
      )
      return {
        on,
        investedMinor: invested[i]!,
        owedMinor: owedOn,
        totalMinor: invested[i]! + cash[i]! + estateMinor - owedOn,
      }
    })
    // Today's point is today's numbers, whatever the history says.
    series[series.length - 1] = {
      on: days.at(-1)!,
      investedMinor,
      owedMinor,
      totalMinor: ownMinor - owedMinor,
    }
  }

  return {
    currency,
    totalMinor: ownMinor - owedMinor,
    cashMinor,
    investedMinor,
    propertyMinor,
    ownMinor,
    owedMinor,
    parts,
    owed,
    missing,
    unconverted: [...unconverted],
    range,
    series,
    since,
    change: changeOver(series.map((p) => p.totalMinor)),
    any,
  }
}

/** Every bank account's balance on each day, summed and converted. */
async function cashHistory(
  db: Conn,
  known: { id: string; minor: Minor; on: string }[],
  days: string[],
  convert: (minor: Minor) => Minor,
): Promise<Minor[]> {
  if (known.length === 0) return days.map(() => 0)
  const rows = await db
    .select({
      accountId: transactions.accountId,
      on: transactions.occurredOn,
      minor: transactions.amountMinor,
    })
    .from(transactions)
    .where(
      and(
        inArray(
          transactions.accountId,
          known.map((k) => k.id),
        ),
        gt(transactions.occurredOn, days[0]!),
      ),
    )
  const totals = days.map(() => 0)
  for (const k of known) {
    const moves = rows.filter((r) => r.accountId === k.id)
    balancesOn(k, moves, days).forEach((m, i) => (totals[i] = totals[i]! + m))
  }
  return totals.map(convert)
}

/**
 * The earliest day the bank balances are known for: the eve of the first transaction they're
 * worked back through, or the day of the oldest balance when there are none.
 */
async function firstCashDay(db: Conn, known: { id: string; on: string }[]): Promise<string> {
  const [row] = await db
    .select({ on: min(transactions.occurredOn) })
    .from(transactions)
    .where(
      inArray(
        transactions.accountId,
        known.map((k) => k.id),
      ),
    )
  const oldest = known.map((k) => k.on).sort()[0]!
  if (!row?.on || row.on >= oldest) return oldest
  return new Date(Date.parse(`${row.on}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}
