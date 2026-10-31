import {
  allocation,
  isAssetClass,
  isHoldingCurrency,
  normalizeSymbol,
  parseDecimal,
  summarizePortfolio,
  valueMinor,
  type AssetClass,
  type Rates,
} from '@hearthside/core'
import type { Db, InstrumentRow, InvestmentAccountRow, MemberRow } from '@hearthside/db'
import { blindIndex, schema } from '@hearthside/db'
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { cleanName } from './http'
import { canEdit } from './ledger'
import { audit, AuthError, type Tx } from './repo'

const { investmentAccounts, instruments, holdings, instrumentPrices, members } = schema

type Conn = Db | Tx

export type InvestmentVisibility = InvestmentAccountRow['visibility']
const VISIBILITIES: readonly InvestmentVisibility[] = ['household', 'private']

/** Investment accounts this member may see: shared ones, and private ones they added or hold. */
function visibleTo(member: MemberRow): SQL {
  return and(
    eq(investmentAccounts.householdId, member.householdId),
    or(
      eq(investmentAccounts.visibility, 'household'),
      eq(investmentAccounts.ownerId, member.id),
      eq(investmentAccounts.holderId, member.id),
    ),
  )!
}

/** The member an investment account belongs to. */
export function investmentHolder(a: Pick<InvestmentAccountRow, 'holderId' | 'ownerId'>): string {
  return a.holderId ?? a.ownerId
}

/** Whoever added the account, whoever holds it, or the household owner may change it. */
export function mayManage(
  member: Pick<MemberRow, 'id' | 'role'>,
  account: Pick<InvestmentAccountRow, 'holderId' | 'ownerId'>,
): boolean {
  if (!canEdit(member)) return false
  return member.role === 'owner' || account.ownerId === member.id || account.holderId === member.id
}

function assertManage(member: MemberRow, account: InvestmentAccountRow) {
  if (!mayManage(member, account))
    throw new AuthError('not_allowed', 'Only the person whose account this is can change it')
}

async function assertHolder(db: Conn, member: MemberRow, holderId: string) {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.id, holderId),
        eq(members.householdId, member.householdId),
        isNull(members.removedAt),
      ),
    )
  if (!row) throw new AuthError('not_found', 'That person isn’t in this home')
}

function checkVisibility(value: unknown): InvestmentVisibility {
  if (!VISIBILITIES.includes(value as InvestmentVisibility))
    throw new AuthError('not_allowed', 'Pick who can see it')
  return value as InvestmentVisibility
}

function checkCurrency(value: unknown): string {
  if (!isHoldingCurrency(value)) throw new AuthError('not_allowed', 'Pick a currency from the list')
  return value
}

function optionalText(value: unknown, max = 60): string | null {
  if (value === undefined || value === null || value === '') return null
  const text = cleanName(value, max)
  if (!text) throw new AuthError('not_allowed', `Keep it under ${max} characters`)
  return text
}

// ---------- Accounts ----------

export async function listInvestmentAccounts(db: Conn, member: MemberRow) {
  return db
    .select()
    .from(investmentAccounts)
    .where(visibleTo(member))
    .orderBy(asc(investmentAccounts.createdAt))
}

export async function getVisibleInvestmentAccount(db: Conn, member: MemberRow, id: string) {
  const [row] = await db
    .select()
    .from(investmentAccounts)
    .where(and(visibleTo(member), eq(investmentAccounts.id, id)))
  if (!row) throw new AuthError('not_found', 'That account isn’t here')
  return row
}

export interface InvestmentAccountInput {
  name: unknown
  provider?: unknown
  currency: unknown
  visibility: unknown
  /** Whose account it is, when that isn't the member adding it. */
  holderId?: unknown
}

export async function createInvestmentAccount(
  db: Conn,
  member: MemberRow,
  input: InvestmentAccountInput,
) {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change data')
  const name = cleanName(input.name)
  if (!name) throw new AuthError('not_allowed', 'Give the account a name, up to 60 characters')
  const holderId = typeof input.holderId === 'string' && input.holderId ? input.holderId : null
  if (holderId && holderId !== member.id) await assertHolder(db, member, holderId)
  const [row] = await db
    .insert(investmentAccounts)
    .values({
      householdId: member.householdId,
      ownerId: member.id,
      holderId: holderId && holderId !== member.id ? holderId : null,
      name,
      provider: optionalText(input.provider),
      currency: checkCurrency(input.currency),
      visibility: checkVisibility(input.visibility),
    })
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'investment_account.created',
    detail: { accountId: row!.id },
  })
  return row!
}

export async function updateInvestmentAccount(
  db: Conn,
  member: MemberRow,
  id: string,
  input: InvestmentAccountInput,
) {
  const account = await getVisibleInvestmentAccount(db, member, id)
  assertManage(member, account)
  const name = cleanName(input.name)
  if (!name) throw new AuthError('not_allowed', 'Give the account a name, up to 60 characters')
  const holderId = typeof input.holderId === 'string' && input.holderId ? input.holderId : null
  if (holderId) await assertHolder(db, member, holderId)
  const [row] = await db
    .update(investmentAccounts)
    .set({
      name,
      provider: optionalText(input.provider),
      currency: checkCurrency(input.currency),
      visibility: checkVisibility(input.visibility),
      ...(holderId ? { holderId: holderId === account.ownerId ? null : holderId } : {}),
    })
    .where(eq(investmentAccounts.id, id))
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'investment_account.updated',
    detail: { accountId: id },
  })
  return row!
}

/** Removes the account and its holdings. */
export async function deleteInvestmentAccount(db: Conn, member: MemberRow, id: string) {
  const account = await getVisibleInvestmentAccount(db, member, id)
  assertManage(member, account)
  await db.delete(investmentAccounts).where(eq(investmentAccounts.id, id))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'investment_account.deleted',
    detail: { accountId: id },
  })
}

// ---------- Instruments and holdings ----------

export type InstrumentKind = InstrumentRow['kind']

/** Plaintext behind instruments.symbol_key. */
export function instrumentKey(kind: InstrumentKind, symbol: string, currency: string): string {
  return `${kind}|${normalizeSymbol(symbol)}|${currency}`
}

export interface HoldingInput {
  kind: unknown
  /** Ticker or fund number. Ignored for cash, which uses the currency. */
  symbol?: unknown
  name?: unknown
  currency: unknown
  assetClass?: unknown
  units: unknown
  /** Price per unit in `currency`, when the member knows it. */
  price?: unknown
  /** Total paid, in `currency`. */
  cost?: unknown
}

interface CleanHolding {
  kind: InstrumentKind
  symbol: string
  name: string
  currency: string
  assetClass: AssetClass
  units: string
  price: string | null
  costMinor: number | null
}

export function cleanHolding(input: HoldingInput): CleanHolding {
  const kind = input.kind === 'cash' ? 'cash' : input.kind === 'security' ? 'security' : null
  if (!kind) throw new AuthError('not_allowed', 'Pick what kind of holding it is')
  const currency = checkCurrency(input.currency)
  const units = parseDecimal(input.units)
  if (!units) throw new AuthError('not_allowed', 'Enter how many units, like 12.5')
  const cost = input.cost === undefined || input.cost === '' ? null : parseDecimal(input.cost)
  if (cost === null && input.cost !== undefined && input.cost !== '')
    throw new AuthError('not_allowed', 'Enter what you paid as a number')
  const costMinor = cost === null ? null : valueMinor(cost, '1')
  if (kind === 'cash')
    return {
      kind,
      symbol: currency,
      name: `Cash (${currency})`,
      currency,
      assetClass: 'cash',
      units,
      price: null,
      costMinor: null,
    }
  const symbol = typeof input.symbol === 'string' ? normalizeSymbol(input.symbol) : ''
  if (!symbol || symbol.length > 20)
    throw new AuthError('not_allowed', 'Enter the ticker or fund number')
  const name = cleanName(input.name, 100)
  if (!name) throw new AuthError('not_allowed', 'Give the holding a name, up to 100 characters')
  if (!isAssetClass(input.assetClass))
    throw new AuthError('not_allowed', 'Pick what kind of asset it is')
  const price = input.price === undefined || input.price === '' ? null : parseDecimal(input.price)
  if (price === null && input.price !== undefined && input.price !== '')
    throw new AuthError('not_allowed', 'Enter the price as a number')
  return { kind, symbol, name, currency, assetClass: input.assetClass, units, price, costMinor }
}

async function upsertInstrument(
  db: Conn,
  member: MemberRow,
  h: CleanHolding,
  /** Imports guess the name and asset type; don't overwrite what a member set. */
  keepExisting = false,
) {
  const symbolKey = blindIndex(instrumentKey(h.kind, h.symbol, h.currency))
  const [row] = await db
    .insert(instruments)
    .values({
      householdId: member.householdId,
      kind: h.kind,
      symbol: h.symbol,
      symbolKey,
      name: h.name,
      currency: h.currency,
      assetClass: h.assetClass,
    })
    .onConflictDoUpdate({
      target: [instruments.householdId, instruments.symbolKey],
      set: keepExisting
        ? { symbolKey: sql`excluded.symbol_key` }
        : { name: h.name, assetClass: h.assetClass },
    })
    .returning()
  return row!
}

/** Add a holding by hand, or replace the units of one the account already has. */
export async function saveHolding(
  db: Db,
  member: MemberRow,
  accountId: string,
  input: HoldingInput,
  now = new Date(),
) {
  const account = await getVisibleInvestmentAccount(db, member, accountId)
  assertManage(member, account)
  const h = cleanHolding(input)
  return db.transaction(async (tx) => {
    const instrument = await upsertInstrument(tx, member, h)
    const [row] = await tx
      .insert(holdings)
      .values({
        householdId: member.householdId,
        accountId,
        instrumentId: instrument.id,
        units: h.units,
        costMinor: h.costMinor,
        source: 'manual',
      })
      .onConflictDoUpdate({
        target: [holdings.accountId, holdings.instrumentId],
        set: {
          units: h.units,
          // An empty "total paid" keeps what was there.
          ...(h.costMinor === null ? {} : { costMinor: h.costMinor }),
          source: 'manual',
          updatedAt: now,
        },
      })
      .returning()
    if (h.price)
      await tx
        .insert(instrumentPrices)
        .values({ instrumentId: instrument.id, price: h.price, pricedAt: now, source: 'manual' })
    await audit(tx, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'holding.saved',
      detail: { accountId, holdingId: row!.id },
    })
    return row!
  })
}

/**
 * Bring an account in line with a holdings file: add or update each row and, with
 * `removeMissing`, drop imported holdings the file no longer lists. Hand-added ones stay.
 */
export async function importHoldings(
  db: Db,
  member: MemberRow,
  accountId: string,
  rows: readonly Omit<HoldingInput, 'kind'>[],
  options: { removeMissing: boolean },
  now = new Date(),
) {
  const account = await getVisibleInvestmentAccount(db, member, accountId)
  assertManage(member, account)
  if (rows.length === 0 || rows.length > 500)
    throw new AuthError('not_allowed', 'A file can have 1 to 500 holdings')
  const clean = rows.map((r) => cleanHolding({ ...r, kind: 'security' }))
  return db.transaction(async (tx) => {
    const before = await tx
      .select({ id: holdings.id, instrumentId: holdings.instrumentId, source: holdings.source })
      .from(holdings)
      .where(eq(holdings.accountId, accountId))
    const seen = new Set<string>()
    let added = 0
    for (const h of clean) {
      const instrument = await upsertInstrument(tx, member, h, true)
      if (seen.has(instrument.id)) continue
      seen.add(instrument.id)
      if (!before.some((b) => b.instrumentId === instrument.id)) added++
      await tx
        .insert(holdings)
        .values({
          householdId: member.householdId,
          accountId,
          instrumentId: instrument.id,
          units: h.units,
          costMinor: h.costMinor,
          source: 'import',
        })
        .onConflictDoUpdate({
          target: [holdings.accountId, holdings.instrumentId],
          set: { units: h.units, source: 'import', updatedAt: now },
        })
      if (h.price)
        await tx
          .insert(instrumentPrices)
          .values({ instrumentId: instrument.id, price: h.price, pricedAt: now, source: 'import' })
    }
    const stale = options.removeMissing
      ? before.filter((b) => b.source === 'import' && !seen.has(b.instrumentId))
      : []
    if (stale.length)
      await tx.delete(holdings).where(
        inArray(
          holdings.id,
          stale.map((b) => b.id),
        ),
      )
    const result = { added, updated: seen.size - added, removed: stale.length }
    await audit(tx, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'holdings.imported',
      detail: { accountId, ...result },
    })
    return result
  })
}

export async function removeHolding(db: Conn, member: MemberRow, holdingId: string) {
  const [row] = await db
    .select({ accountId: holdings.accountId })
    .from(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.householdId, member.householdId)))
  if (!row) throw new AuthError('not_found', 'That holding isn’t here')
  const account = await getVisibleInvestmentAccount(db, member, row.accountId)
  assertManage(member, account)
  await db.delete(holdings).where(eq(holdings.id, holdingId))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'holding.removed',
    detail: { accountId: row.accountId, holdingId },
  })
}

export interface HoldingView {
  id: string
  accountId: string
  instrumentId: string
  kind: InstrumentKind
  symbol: string
  name: string
  currency: string
  assetClass: AssetClass
  units: string
  costMinor: number | null
  /** Latest price per unit; '1' for cash; null when none is known yet. */
  price: string | null
  pricedAt: Date | null
  priceSource: 'manual' | 'market' | 'import' | null
  /** Value in `currency`, minor units; null without a price. */
  valueMinor: number | null
  /** Change since the last close, in `currency` minor units, for market prices. */
  changeMinor: number | null
  /** What the quote source last said about it (securities only). */
  quoteStatus: InstrumentRow['quoteStatus']
  checkedAt: Date | null
  updatedAt: Date
}

/** Holdings in the accounts this member may see, with their latest prices. */
export async function listHoldings(
  db: Conn,
  member: MemberRow,
  accountIds?: readonly string[],
): Promise<HoldingView[]> {
  const ids = accountIds ?? (await listInvestmentAccounts(db, member)).map((a) => a.id)
  if (ids.length === 0) return []
  return loadHoldings(db, and(visibleTo(member), inArray(holdings.accountId, [...ids]))!)
}

/** Every holding in a household, whoever can see it. Only for household-wide bookkeeping. */
export async function householdHoldings(db: Conn, householdId: string): Promise<HoldingView[]> {
  return loadHoldings(db, eq(holdings.householdId, householdId))
}

async function loadHoldings(db: Conn, where: SQL): Promise<HoldingView[]> {
  const rows = await db
    .select({ holding: holdings, instrument: instruments })
    .from(holdings)
    .innerJoin(instruments, eq(instruments.id, holdings.instrumentId))
    .innerJoin(investmentAccounts, eq(investmentAccounts.id, holdings.accountId))
    .where(where)
  const prices = await latestPrices(
    db,
    rows.filter((r) => r.instrument.kind === 'security').map((r) => r.instrument.id),
  )
  return rows
    .map(({ holding: h, instrument: i }): HoldingView => {
      const p = i.kind === 'cash' ? { price: '1', pricedAt: null, source: null } : prices.get(i.id)
      const price = p?.price ?? null
      const value = price === null ? null : valueMinor(h.units, price)
      const change =
        value !== null && p?.source === 'market' && i.prevClose
          ? value - valueMinor(h.units, i.prevClose)
          : null
      return {
        id: h.id,
        accountId: h.accountId,
        instrumentId: i.id,
        kind: i.kind,
        symbol: i.symbol,
        name: i.name,
        currency: i.currency,
        assetClass: isAssetClass(i.assetClass) ? i.assetClass : 'other',
        units: h.units,
        costMinor: h.costMinor,
        price,
        pricedAt: p?.pricedAt ?? null,
        priceSource: p?.source ?? null,
        valueMinor: value,
        changeMinor: change,
        quoteStatus: i.quoteStatus,
        checkedAt: i.checkedAt,
        updatedAt: h.updatedAt,
      }
    })
    .sort((a, b) => (b.valueMinor ?? -1) - (a.valueMinor ?? -1) || a.name.localeCompare(b.name))
}

/**
 * Current price per instrument: the newest market price while the quote source knows the
 * instrument (a market close can be older than a price typed in since), else the newest of any.
 */
export async function latestPrices(db: Conn, instrumentIds: readonly string[]) {
  const map = new Map<
    string,
    { price: string; pricedAt: Date; source: 'manual' | 'market' | 'import' }
  >()
  if (instrumentIds.length === 0) return map
  const rows = await db
    .selectDistinctOn([instrumentPrices.instrumentId], {
      instrumentId: instrumentPrices.instrumentId,
      price: instrumentPrices.price,
      pricedAt: instrumentPrices.pricedAt,
      source: instrumentPrices.source,
    })
    .from(instrumentPrices)
    .innerJoin(instruments, eq(instruments.id, instrumentPrices.instrumentId))
    .where(inArray(instrumentPrices.instrumentId, [...new Set(instrumentIds)]))
    .orderBy(
      instrumentPrices.instrumentId,
      desc(sql`${instrumentPrices.source} = 'market' and ${instruments.quoteStatus} = 'ok'`),
      desc(instrumentPrices.pricedAt),
    )
  for (const r of rows)
    map.set(r.instrumentId, { price: r.price, pricedAt: r.pricedAt, source: r.source })
  return map
}

/** Everything the Invest tab shows, in the member's display currency. */
export async function portfolio(db: Conn, member: MemberRow, rates: Rates = new Map()) {
  const accounts = await listInvestmentAccounts(db, member)
  const list = await listHoldings(
    db,
    member,
    accounts.map((a) => a.id),
  )
  const summary = summarizePortfolio(list, member.displayCurrency, rates)
  return { accounts, holdings: list, summary, allocation: allocation(summary.byClass) }
}
