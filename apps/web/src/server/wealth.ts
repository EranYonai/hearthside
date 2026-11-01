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
  weeklyDays,
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
  /** Points over `range`, oldest first: weekly up to a year, then monthly. Empty when there's nothing to draw. */
  range: WealthRange
  /** The chart's points, oldest first. */
  series: WealthPoint[]
  /** Change since the first point of the series. */
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
  if (any) {
    const today = dayOf(now)
    const history =
      invest.accounts.length > 0
        ? trends(db, member, range, rates, now, { currency })
        : Promise.resolve(null)
    const days =
      range === '6m'
        ? weeklyDays(today)
        : range === '1y'
          ? weeklyDays(today, 52)
          : chartDays(today, await firstDay(db, member, today, (await history)?.series[0]?.on))
    const [cash, invested] = await Promise.all([
      cashHistory(db, known, days, (m) => convertMinor(m, 'ILS', currency, rates) ?? 0),
      history.then((t) =>
        t
          ? // Accounts were held before their first recorded value; carry it back.
            valuesOn(
              t.series.map((p) => ({ on: p.on, valueMinor: p.valueMinor })),
              days,
              { backfill: true },
            )
          : days.map(() => 0),
      ),
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

/** The earliest day the household has data for: its first transaction or recorded value. */
async function firstDay(db: Conn, member: MemberRow, today: string, investedFrom?: string) {
  const visible = (await listAccounts(db, member)).map((a) => a.id)
  const [row] = visible.length
    ? await db
        .select({ on: min(transactions.occurredOn) })
        .from(transactions)
        .where(inArray(transactions.accountId, visible))
    : [{ on: null }]
  const first = [row?.on, investedFrom].filter((d): d is string => !!d).sort()[0]
  return first ?? today
}
