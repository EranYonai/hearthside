import {
  accountLook,
  balancesOn,
  changeOver,
  convertMinor,
  type Minor,
  type Rates,
  valuesOn,
  weeklyDays,
} from '@hearthside/core'
import { type MemberRow, schema } from '@hearthside/db'
import { and, gt, inArray } from 'drizzle-orm'
import { portfolio } from './invest'
import { listAccounts } from './ledger'
import type { Tx } from './repo'
import { dayOf, trends } from './trends'

const { transactions } = schema

type Conn = Parameters<typeof listAccounts>[0] | Tx

export interface WealthPart {
  key: string
  name: string
  provider: string | null
  kind: 'cash' | 'invest'
  /** The account's color (#RRGGBB), or null for a neutral one. */
  color: string | null
  /** In the wealth currency. */
  minor: Minor
  href: string
}

export interface WealthPoint {
  on: string
  totalMinor: Minor
  investedMinor: Minor
}

export interface Wealth {
  currency: string
  totalMinor: Minor
  cashMinor: Minor
  investedMinor: Minor
  /** Each account's share, largest first. */
  parts: WealthPart[]
  /** Bank accounts with no known balance, left out of the total. */
  missing: { id: string; name: string }[]
  /** Currencies with no rate to `currency`; those amounts are left out. */
  unconverted: string[]
  /** One point a week for six months, oldest first. Empty when there's nothing to draw. */
  series: WealthPoint[]
  /** Change since the first point of the series. */
  change: { minor: Minor; percent: number | null }
  /** True when anything is counted at all. */
  any: boolean
}

/**
 * What the household owns, as the member sees it: bank balances plus investments, in the member's
 * display currency. Past weeks work bank balances back through the transactions since, and take
 * investments from their recorded values.
 */
export async function wealth(
  db: Conn,
  member: MemberRow,
  rates: Rates,
  now = new Date(),
): Promise<Wealth> {
  const [banks, invest] = await Promise.all([
    listAccounts(db, member).then((list) => list.filter((a) => a.kind === 'bank')),
    portfolio(db, member, rates),
  ])
  const currency = invest.summary.currency
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
  parts.sort((a, b) => b.minor - a.minor)
  const cashMinor = parts.filter((p) => p.kind === 'cash').reduce((n, p) => n + p.minor, 0)
  const investedMinor = invest.summary.totalMinor
  const any = known.length > 0 || unconverted.size > 0 || invest.accounts.length > 0

  const days = weeklyDays(dayOf(now))
  let series: WealthPoint[] = []
  if (any) {
    const [cash, invested] = await Promise.all([
      cashHistory(db, known, days, (m) => convertMinor(m, 'ILS', currency, rates) ?? 0),
      invest.accounts.length > 0
        ? trends(db, member, '6m', rates, now, { currency }).then((t) =>
            // Accounts were held before their first recorded value; carry it back.
            valuesOn(
              t.series.map((p) => ({ on: p.on, valueMinor: p.valueMinor })),
              days,
              { backfill: true },
            ),
          )
        : days.map(() => 0),
    ])
    series = days.map((on, i) => ({
      on,
      investedMinor: invested[i]!,
      totalMinor: invested[i]! + cash[i]!,
    }))
    // Today's point is today's numbers, whatever the history says.
    series[series.length - 1] = {
      on: days.at(-1)!,
      investedMinor,
      totalMinor: investedMinor + cashMinor,
    }
  }

  return {
    currency,
    totalMinor: cashMinor + investedMinor,
    cashMinor,
    investedMinor,
    parts,
    missing,
    unconverted: [...unconverted],
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
