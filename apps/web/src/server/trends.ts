import {
  combineSeries,
  convertMinor,
  type Flow,
  isMovementKind,
  MOVEMENT_KINDS,
  type MovementKind,
  movementSign,
  parseDecimal,
  type Rates,
  rangeStart,
  timeWeightedReturn,
  type TrendPoint,
  type TrendRange,
  trendSeries,
  type ValuePoint,
  type YearSummary,
  yearSummaries,
  decimalToMinor,
} from '@hearthside/core'
import {
  type Db,
  type InvestmentAccountRow,
  type MemberRow,
  type PortfolioSnapshotRow,
  schema,
} from '@hearthside/db'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { currentRates } from './fx'
import {
  getVisibleInvestmentAccount,
  householdHoldings,
  listInvestmentAccounts,
  mayManage,
} from './invest'
import { AuthError, type Tx } from './repo'
import { keepQuotesFresh } from './prices'

const { investmentAccounts, investmentTransactions, portfolioSnapshots } = schema

type Conn = Db | Tx

const KINDS = MOVEMENT_KINDS.map((k) => k.slug)

export function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Write today's value for every investment account in a household, in each account's currency.
 * Holdings with no price, or in a currency with no rate yet, are left out of the value.
 */
export async function recordSnapshots(
  db: Conn,
  householdId: string,
  rates: Rates,
  now = new Date(),
): Promise<number> {
  const accounts = await db
    .select()
    .from(investmentAccounts)
    .where(eq(investmentAccounts.householdId, householdId))
  if (accounts.length === 0) return 0
  const list = await householdHoldings(db, householdId)
  const on = dayOf(now)
  for (const account of accounts) {
    const value = list
      .filter((h) => h.accountId === account.id && h.valueMinor !== null)
      .reduce(
        (n, h) => n + (convertMinor(h.valueMinor!, h.currency, account.currency, rates) ?? 0),
        0,
      )
    await db
      .insert(portfolioSnapshots)
      .values({
        accountId: account.id,
        householdId,
        on,
        valueMinor: value,
        currency: account.currency,
      })
      .onConflictDoUpdate({
        target: [portfolioSnapshots.accountId, portfolioSnapshots.on],
        set: { valueMinor: value, currency: account.currency, updatedAt: now },
      })
  }
  return accounts.length
}

/** Refresh rates and prices, then record today's values for every household that invests. */
export async function recordAllSnapshots(db: Db, now = new Date()): Promise<void> {
  const [{ rates }] = await Promise.all([currentRates(db), keepQuotesFresh(db)])
  const homes = await db
    .selectDistinct({ householdId: investmentAccounts.householdId })
    .from(investmentAccounts)
  for (const { householdId } of homes) await recordSnapshots(db, householdId, rates, now)
}

let timer: ReturnType<typeof setInterval> | undefined

/** Record values now and then every hour, so trends have a point per day without a visit. */
export function startSnapshots(db: Db, everyMs = 60 * 60 * 1000): void {
  if (timer) return
  const run = () =>
    recordAllSnapshots(db).catch((err: unknown) =>
      console.error(
        JSON.stringify({ level: 'warn', msg: 'portfolio snapshot failed', error: String(err) }),
      ),
    )
  void run()
  timer = setInterval(run, everyMs)
  timer.unref?.()
}

// Money in and out ----------------------------------------------------------------------------

export interface MovementInput {
  kind?: unknown
  on?: unknown
  amount?: unknown
}

export interface MovementView {
  id: string
  accountId: string
  kind: MovementKind
  on: string
  amountMinor: number
  currency: string
  source: 'manual' | 'import' | 'sync'
}

function cleanMovement(input: MovementInput, today: string) {
  if (!isMovementKind(input.kind))
    throw new AuthError('not_allowed', 'Pick what kind of money this was.')
  const on = typeof input.on === 'string' ? input.on : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on) || Number.isNaN(Date.parse(`${on}T00:00:00Z`)))
    throw new AuthError('not_allowed', 'Enter a date.')
  if (on > today) throw new AuthError('not_allowed', 'The date can’t be in the future.')
  const amount = typeof input.amount === 'string' ? parseDecimal(input.amount) : null
  const minor = amount === null ? null : decimalToMinor(amount)
  if (minor === null || minor <= 0)
    throw new AuthError('not_allowed', 'Enter an amount above zero.')
  return { kind: input.kind, on, amountMinor: movementSign(input.kind) * minor }
}

async function manageable(db: Conn, member: MemberRow, accountId: string) {
  const account = await getVisibleInvestmentAccount(db, member, accountId)
  if (!mayManage(member, account))
    throw new AuthError('not_allowed', 'Only the account’s holder can change it.')
  return account
}

export async function addMovement(
  db: Conn,
  member: MemberRow,
  accountId: string,
  input: MovementInput,
  now = new Date(),
): Promise<MovementView> {
  const account = await manageable(db, member, accountId)
  const clean = cleanMovement(input, dayOf(now))
  const [row] = await db
    .insert(investmentTransactions)
    .values({
      householdId: account.householdId,
      accountId: account.id,
      kind: clean.kind,
      occurredOn: clean.on,
      amountMinor: clean.amountMinor,
      currency: account.currency,
      source: 'manual',
    })
    .returning()
  return view(row!)
}

export async function removeMovement(db: Conn, member: MemberRow, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(investmentTransactions)
    .where(and(eq(investmentTransactions.id, id), inArray(investmentTransactions.kind, KINDS)))
  if (!row || row.householdId !== member.householdId)
    throw new AuthError('not_found', 'That entry is gone')
  await manageable(db, member, row.accountId)
  await db.delete(investmentTransactions).where(eq(investmentTransactions.id, id))
}

function view(row: typeof investmentTransactions.$inferSelect): MovementView {
  return {
    id: row.id,
    accountId: row.accountId,
    kind: row.kind as MovementKind,
    on: row.occurredOn,
    amountMinor: row.amountMinor,
    currency: row.currency,
    source: row.source,
  }
}

/** Money in and out of accounts the member can see, newest first. */
export async function listMovements(
  db: Conn,
  member: MemberRow,
  accountIds?: readonly string[],
): Promise<MovementView[]> {
  const ids = accountIds ?? (await listInvestmentAccounts(db, member)).map((a) => a.id)
  if (ids.length === 0) return []
  const visible = new Set((await listInvestmentAccounts(db, member)).map((a) => a.id))
  const allowed = ids.filter((id) => visible.has(id))
  if (allowed.length === 0) return []
  const rows = await db
    .select()
    .from(investmentTransactions)
    .where(
      and(
        inArray(investmentTransactions.accountId, allowed),
        inArray(investmentTransactions.kind, KINDS),
      ),
    )
    .orderBy(desc(investmentTransactions.occurredOn), desc(investmentTransactions.createdAt))
  return rows.map(view)
}

// Trends --------------------------------------------------------------------------------------

export interface Trends {
  currency: string
  range: TrendRange
  series: TrendPoint[]
  /** Time-weighted return over the range, when it has a starting value. */
  rangeReturn: number | null
  years: YearSummary[]
  /** First day with a recorded value, or null before the first one. */
  since: string | null
  /** Account currencies with no rate to the display currency; those accounts are left out. */
  missingRates: string[]
}

/** Value against money put in, for the accounts a member can see, in their display currency. */
export async function trends(
  db: Conn,
  member: MemberRow,
  range: TrendRange,
  rates: Rates,
  now = new Date(),
): Promise<Trends> {
  const currency = member.displayCurrency
  const accounts = await listInvestmentAccounts(db, member)
  const missing = new Set<string>()
  const usable = accounts.filter((a: InvestmentAccountRow) => {
    const ok = convertMinor(1_000_000, a.currency, currency, rates) !== null
    if (!ok) missing.add(a.currency)
    return ok
  })
  const ids = usable.map((a) => a.id)
  const [snapshots, movements]: [PortfolioSnapshotRow[], MovementView[]] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(portfolioSnapshots)
          .where(inArray(portfolioSnapshots.accountId, ids))
          .orderBy(asc(portfolioSnapshots.on)),
        listMovements(db, member, ids),
      ])
    : [[], []]
  const toDisplay = (minor: number, from: string) => convertMinor(minor, from, currency, rates) ?? 0
  const perAccount = ids.map((id) =>
    snapshots
      .filter((s) => s.accountId === id)
      .map((s): ValuePoint => ({ on: s.on, valueMinor: toDisplay(s.valueMinor, s.currency) })),
  )
  const combined = combineSeries(perAccount)
  const flows = movements.map((m): Flow => ({
    on: m.on,
    kind: m.kind,
    amountMinor: toDisplay(m.amountMinor, m.currency),
  }))
  const series = trendSeries(combined, flows, rangeStart(range, dayOf(now)))
  return {
    currency,
    range,
    series,
    rangeReturn: timeWeightedReturn(
      series.map((p) => ({ on: p.on, valueMinor: p.valueMinor })),
      flows,
    ),
    years: yearSummaries(combined, flows),
    since: combined[0]?.on ?? null,
    missingRates: [...missing],
  }
}
