import {
  countsAsSpending,
  matchCardBills,
  duplicateKeys,
  suggestAccountName,
  type DetectedSource,
  CUSTOM_PREFIX,
  isCategory,
  normalizeDescription,
  type ParsedTransaction,
} from '@hearthside/core'
import type { AccountRow, MemberRow } from '@hearthside/db'
import { blindIndex, schema } from '@hearthside/db'
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { householdCategorySet } from './categories'
import { loadContext, quickCategory } from './categorize'
import { audit, AuthError, type Tx } from './repo'
import { sha256 } from './tokens'

const { accounts, importBatches, transactions, categoryRules, members } = schema

type Conn = Parameters<typeof audit>[0]

export type AccountKind = AccountRow['kind']
export type AccountVisibility = AccountRow['visibility']

/** Owners and adults bring in data; viewers only look. */
export function canEdit(member: Pick<MemberRow, 'role'>): boolean {
  return member.role === 'owner' || member.role === 'adult'
}

function assertEditor(member: MemberRow) {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change data')
}

/** The member an account belongs to: its holder, or whoever added it. */
const holder = sql<string>`coalesce(${accounts.holderId}, ${accounts.ownerId})`

/** Accounts this member may see: shared ones, and private ones they added or hold. */
function visibleTo(member: MemberRow): SQL {
  return and(
    eq(accounts.householdId, member.householdId),
    or(
      eq(accounts.visibility, 'household'),
      eq(accounts.ownerId, member.id),
      eq(accounts.holderId, member.id),
    ),
  )!
}

/** A member of this household who is still active. */
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

// ---------- Accounts ----------

export async function listAccounts(db: Conn, member: MemberRow) {
  return db.select().from(accounts).where(visibleTo(member)).orderBy(accounts.createdAt)
}

export async function createAccount(
  db: Conn,
  member: MemberRow,
  input: {
    name: string
    kind: AccountKind
    visibility: AccountVisibility
    provider?: string | null
    network?: string | null
    last4?: string | null
    /** Who holds it, when that isn't the member adding it. */
    holderId?: string | null
  },
) {
  assertEditor(member)
  const { holderId, ...rest } = input
  if (holderId && holderId !== member.id) await assertHolder(db, member, holderId)
  const [row] = await db
    .insert(accounts)
    .values({
      householdId: member.householdId,
      ownerId: member.id,
      holderId: holderId && holderId !== member.id ? holderId : null,
      ...rest,
    })
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'account.created',
    detail: { accountId: row!.id, kind: input.kind, provider: input.provider ?? null },
  })
  return row!
}

export async function getVisibleAccount(db: Conn, member: MemberRow, id: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(visibleTo(member), eq(accounts.id, id)))
  if (!row) throw new AuthError('not_found', 'That account isn’t here')
  return row
}

/** Only an account's owner imports into it. */
export async function getOwnAccount(db: Conn, member: MemberRow, id: string) {
  assertEditor(member)
  const row = await getVisibleAccount(db, member, id)
  if (row.ownerId !== member.id)
    throw new AuthError('not_allowed', 'Only the person who added this account can import into it')
  return row
}

/** The person who added an account, or the household owner, may change its details. */
export async function updateAccount(
  db: Conn,
  member: MemberRow,
  id: string,
  input: {
    name?: string
    holderId?: string
    visibility?: AccountVisibility
    /** A provider id, or null for none. */
    provider?: string | null
    /** #RRGGBB, or null to use the provider's color. */
    color?: string | null
  },
) {
  assertEditor(member)
  const account = await getVisibleAccount(db, member, id)
  if (account.ownerId !== member.id && member.role !== 'owner')
    throw new AuthError('not_allowed', 'Only the person who added this account can change it')
  if (input.holderId) await assertHolder(db, member, input.holderId)
  const [row] = await db
    .update(accounts)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.holderId
        ? { holderId: input.holderId === account.ownerId ? null : input.holderId }
        : {}),
    })
    .where(eq(accounts.id, id))
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'account.updated',
    detail: { accountId: id, fields: Object.keys(input) },
  })
  return row!
}

/** The member who holds an account. */
export function holderOf(account: Pick<AccountRow, 'holderId' | 'ownerId'>): string {
  return account.holderId ?? account.ownerId
}

// ---------- Import ----------

export interface PreparedRow extends ParsedTransaction {
  dedupKey: string
  duplicate: boolean
}

/** Keyed hash of a description, as stored in description_key and category_rules.match. */
export function descriptionIndex(description: string): string {
  return blindIndex(normalizeDescription(description))
}

/** Hash the parser's duplicate keys and mark rows already stored for this account. */
export async function prepareImport(
  db: Conn,
  account: AccountRow | null,
  parsed: readonly ParsedTransaction[],
): Promise<PreparedRow[]> {
  const keys = duplicateKeys(parsed).map((k) => blindIndex(sha256(k)))
  const existing = new Set<string>()
  for (let i = 0; account && i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    const rows = await db
      .select({ key: transactions.dedupKey })
      .from(transactions)
      .where(and(eq(transactions.accountId, account.id), inArray(transactions.dedupKey, chunk)))
    for (const r of rows) existing.add(r.key)
  }
  return parsed.map((t, i) => ({ ...t, dedupKey: keys[i]!, duplicate: existing.has(keys[i]!) }))
}

export interface ProposedAccount {
  name: string
  kind: AccountKind
  provider: string | null
  network: string | null
  last4: string | null
}

export interface ImportGroup {
  /** The member's existing account, or null when one will be created from `proposed`. */
  account: AccountRow | null
  proposed: ProposedAccount
  rows: PreparedRow[]
}

/**
 * Decide which of the member's accounts each row goes to. Files that list several cards
 * are split by card. Without an explicit account, a matching one (same provider and last
 * four digits) is picked, or a new one is proposed.
 */
export async function planImport(
  db: Conn,
  member: MemberRow,
  source: DetectedSource,
  parsed: readonly ParsedTransaction[],
  accountId?: string,
): Promise<ImportGroup[]> {
  assertEditor(member)
  if (accountId) {
    const account = await getOwnAccount(db, member, accountId)
    return [
      {
        account,
        proposed: { ...account, name: account.name },
        rows: await prepareImport(db, account, parsed),
      },
    ]
  }
  const groups = new Map<string, ParsedTransaction[]>()
  for (const t of parsed) {
    const key = t.last4 ?? source.last4 ?? ''
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  if (groups.size === 0) groups.set(source.last4 ?? '', [])
  const own = (await listAccounts(db, member)).filter((a) => a.ownerId === member.id)
  const result: ImportGroup[] = []
  for (const [key, rows] of groups) {
    const last4 = key || null
    const proposed: ProposedAccount = {
      name: suggestAccountName({ provider: source.provider, kind: source.kind, last4 }),
      kind: source.kind,
      provider: source.provider,
      network: source.network,
      last4,
    }
    const account =
      own.find(
        (a) => a.provider === source.provider && a.last4 === last4 && a.kind === source.kind,
      ) ?? null
    result.push({ account, proposed, rows: await prepareImport(db, account, rows) })
  }
  return result
}

/** Create any proposed accounts and import every group. */
export async function commitPlan(
  db: Conn,
  member: MemberRow,
  groups: readonly ImportGroup[],
  input: { fileName: string; fileHash: string; skipped: number; holderId?: string | null },
) {
  const { holderId, ...batchInput } = input
  const batches = []
  for (const [i, g] of groups.entries()) {
    const account =
      g.account ??
      (await createAccount(db, member, { ...g.proposed, visibility: 'household', holderId }))
    const batch = await commitImport(db, member, account, {
      ...batchInput,
      rows: g.rows,
      skipped: i === 0 ? input.skipped : 0,
    })
    batches.push({ batch, account })
  }
  return batches
}

export async function findBatchByHash(db: Conn, accountId: string, fileHash: string) {
  const [row] = await db
    .select()
    .from(importBatches)
    .where(
      and(eq(importBatches.accountId, accountId), eq(importBatches.fileHash, blindIndex(fileHash))),
    )
    .limit(1)
  return row
}

export async function commitImport(
  db: Conn,
  member: MemberRow,
  account: AccountRow,
  input: { fileName: string; fileHash: string; rows: readonly PreparedRow[]; skipped: number },
) {
  if (account.ownerId !== member.id) throw new AuthError('not_allowed', 'Not your account')
  const run = async (tx: Tx) => {
    const categories = await loadContext(tx, member.householdId)
    const [batch] = await tx
      .insert(importBatches)
      .values({
        householdId: member.householdId,
        accountId: account.id,
        memberId: member.id,
        fileName: input.fileName.slice(0, 200),
        fileHash: blindIndex(input.fileHash),
        added: 0,
        duplicates: 0,
        skipped: input.skipped,
      })
      .returning()
    const fresh = input.rows.filter((r) => !r.duplicate)
    let added = 0
    for (let i = 0; i < fresh.length; i += 500) {
      const values = fresh.slice(i, i + 500).map((r) => {
        const key = descriptionIndex(r.description)
        return {
          householdId: member.householdId,
          accountId: account.id,
          batchId: batch!.id,
          occurredOn: r.occurredOn,
          postedOn: r.postedOn ?? null,
          description: r.description.slice(0, 500),
          descriptionKey: key,
          amountMinor: r.amountMinor,
          originalMinor: r.original?.minor ?? null,
          originalCurrency: r.original?.currency ?? null,
          installmentN: r.installment?.n ?? null,
          installmentTotal: r.installment?.total ?? null,
          reference: r.reference ?? null,
          notes: r.notes?.slice(0, 500) ?? null,
          // Rules, past choices and keywords now; the model fills the rest in the background.
          ...quickCategory(categories, {
            description: r.description,
            descriptionKey: key,
            amountMinor: r.amountMinor,
          }),
          dedupKey: r.dedupKey,
        }
      })
      const inserted = await tx
        .insert(transactions)
        .values(values)
        .onConflictDoNothing({ target: [transactions.accountId, transactions.dedupKey] })
        .returning({ id: transactions.id })
      added += inserted.length
    }
    const duplicates = input.rows.length - added
    const [done] = await tx
      .update(importBatches)
      .set({ added, duplicates })
      .where(eq(importBatches.id, batch!.id))
      .returning()
    await audit(tx, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'import.added',
      detail: { batchId: batch!.id, accountId: account.id, added, duplicates },
    })
    await linkCardBills(tx, member.householdId)
    return done!
  }
  return db.transaction(run)
}

export async function listBatches(db: Conn, member: MemberRow, limit = 10) {
  return db
    .select({ batch: importBatches, accountName: accounts.name, ownerId: accounts.ownerId })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .where(visibleTo(member))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit)
}

/** Remove an import and every transaction it added. */
export async function undoBatch(db: Conn, member: MemberRow, batchId: string) {
  assertEditor(member)
  const [row] = await db
    .select({ batch: importBatches, ownerId: accounts.ownerId })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .where(and(visibleTo(member), eq(importBatches.id, batchId)))
  if (!row) throw new AuthError('not_found', 'That import isn’t here')
  if (row.ownerId !== member.id && member.role !== 'owner')
    throw new AuthError('not_allowed', 'Only the account’s owner can undo this import')
  await db.delete(importBatches).where(eq(importBatches.id, batchId))
  await linkCardBills(db, member.householdId)
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'import.undone',
    detail: { batchId, removed: row.batch.added },
  })
}

/** How many transactions an account holds, to warn before deleting it. */
export async function countAccountTransactions(db: Conn, member: MemberRow, id: string) {
  await getVisibleAccount(db, member, id)
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.accountId, id))
  return row?.n ?? 0
}

/**
 * Delete an account with all its imports and transactions. Only whoever added it, or the
 * household owner, may do this. It can't be undone.
 */
export async function deleteAccount(db: Conn, member: MemberRow, id: string) {
  assertEditor(member)
  const account = await getVisibleAccount(db, member, id)
  if (account.ownerId !== member.id && member.role !== 'owner')
    throw new AuthError('not_allowed', 'Only the person who added this account can delete it')
  const removed = await countAccountTransactions(db, member, id)
  await db.delete(accounts).where(eq(accounts.id, id))
  // Bills that account's statements accounted for may now pay something else, or nothing.
  await linkCardBills(db, member.householdId)
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'account.deleted',
    detail: { accountId: id, kind: account.kind, removed },
  })
  return { removed }
}

// ---------- Transactions ----------

/** First day of the month and of the next one, for a YYYY-MM string. */
export function monthRange(month: string): [string, string] {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new AuthError('not_found', 'Bad month')
  const y = Number(m[1])
  const mo = Number(m[2])
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  return [`${month}-01`, `${next}-01`]
}

export interface TransactionFilter {
  month: string
  accountId?: string
  /** Only cards, or only bank accounts. */
  kind?: AccountKind
  /** Only accounts this member holds. */
  holderId?: string
  /** A category slug, or 'none' for uncategorized. */
  category?: string
  search?: string
}

// Descriptions and amounts are encrypted, so search and totals run here after reading.
function filterConditions(member: MemberRow, f: TransactionFilter): SQL {
  const [from, to] = monthRange(f.month)
  const conditions: SQL[] = [
    visibleTo(member),
    gte(transactions.occurredOn, from),
    lt(transactions.occurredOn, to),
  ]
  if (f.accountId) conditions.push(eq(transactions.accountId, f.accountId))
  if (f.kind) conditions.push(eq(accounts.kind, f.kind))
  if (f.holderId) conditions.push(sql`${holder} = ${f.holderId}`)
  if (f.category === 'alerts')
    conditions.push(isNotNull(transactions.alert), isNull(transactions.alertDismissedAt))
  else if (f.category === 'none') conditions.push(isNull(transactions.category))
  else if (f.category && (isCategory(f.category) || f.category.startsWith(CUSTOM_PREFIX)))
    conditions.push(eq(transactions.category, f.category))
  return and(...conditions)!
}

function matchesSearch(description: string, search: string | undefined): boolean {
  const q = search?.trim().toLocaleLowerCase()
  return !q || description.toLocaleLowerCase().includes(q)
}

export async function listTransactions(db: Conn, member: MemberRow, f: TransactionFilter) {
  const rows = await db
    .select({
      t: transactions,
      accountName: accounts.name,
      accountKind: accounts.kind,
      accountProvider: accounts.provider,
      accountColor: accounts.color,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(filterConditions(member, f))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt), transactions.id)
  return rows.filter((r) => matchesSearch(r.t.description, f.search)).slice(0, 1000)
}

// ---------- Card bills ----------

/**
 * Find the bank rows that pay a card bill and record which bill, so totals don't count
 * card spending twice (see card-bills.ts in core). Runs over the whole household after
 * every import and undo, since either side can arrive first. Returns how many rows changed.
 */
export async function linkCardBills(db: Conn, householdId: string): Promise<number> {
  const rows = await db
    .select({
      id: transactions.id,
      kind: accounts.kind,
      provider: accounts.provider,
      accountId: transactions.accountId,
      batchId: transactions.batchId,
      occurredOn: transactions.occurredOn,
      postedOn: transactions.postedOn,
      description: transactions.description,
      amount: transactions.amountMinor,
      cardBill: transactions.cardBill,
      cardBillAccountId: transactions.cardBillAccountId,
      cardBillExpectedMinor: transactions.cardBillExpectedMinor,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(transactions.householdId, householdId))
  const bank = rows.filter((r) => r.kind === 'bank')
  const matches = matchCardBills(
    bank
      .filter((r) => r.amount < 0)
      .map((r) => ({
        id: r.id,
        date: r.postedOn ?? r.occurredOn,
        amountMinor: r.amount,
        description: r.description,
      })),
    rows
      .filter((r) => r.kind === 'card')
      .map((r) => ({
        accountId: r.accountId,
        provider: r.provider,
        occurredOn: r.occurredOn,
        postedOn: r.postedOn,
        batchId: r.batchId,
        amountMinor: r.amount,
      })),
  )
  let changed = 0
  for (const r of bank) {
    const m = matches.get(r.id)
    const next = {
      cardBill: m?.via ?? null,
      cardBillAccountId: m?.accountId ?? null,
      cardBillExpectedMinor: m?.expectedMinor ?? null,
    }
    if (
      next.cardBill === r.cardBill &&
      next.cardBillAccountId === r.cardBillAccountId &&
      next.cardBillExpectedMinor === r.cardBillExpectedMinor
    )
      continue
    await db.update(transactions).set(next).where(eq(transactions.id, r.id))
    changed++
  }
  return changed
}

/** Bring card bill links up to date for every household, e.g. after an upgrade. */
export async function linkAllCardBills(db: Conn): Promise<number> {
  const { households } = schema
  let changed = 0
  for (const h of await db.select({ id: households.id }).from(households))
    changed += await linkCardBills(db, h.id)
  return changed
}

/**
 * Whether a bank row that pays a card bill should be left out for this member: only when
 * they can see the card purchases it pays for. Otherwise it's their only record of them.
 */
function billCovered(
  row: { cardBill: string | null; cardBillAccountId: string | null },
  visibleCards: ReadonlySet<string>,
): boolean {
  if (!row.cardBill) return false
  return row.cardBillAccountId ? visibleCards.has(row.cardBillAccountId) : visibleCards.size > 0
}

async function visibleCardIds(db: Conn, member: MemberRow): Promise<Set<string>> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(visibleTo(member), eq(accounts.kind, 'card')))
  return new Set(rows.map((r) => r.id))
}

/** True when a filter mixes cards and bank accounts, so card bills would count twice. */
function mixesKinds(f: TransactionFilter) {
  return !f.kind && !f.accountId
}

/** Money out and in for the filter, leaving out transfers and savings. */
export async function totals(db: Conn, member: MemberRow, f: TransactionFilter) {
  const mixed = mixesKinds(f)
  const [rows, cards] = await Promise.all([
    db
      .select({
        accountId: transactions.accountId,
        category: transactions.category,
        description: transactions.description,
        amount: transactions.amountMinor,
        cardBill: transactions.cardBill,
        cardBillAccountId: transactions.cardBillAccountId,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(filterConditions(member, f)),
    mixed ? visibleCardIds(db, member) : new Set<string>(),
  ])
  let spent = 0
  let received = 0
  let count = 0
  let cardBills = 0
  const byCategory = new Map<string | null, number>()
  const byAccount = new Map<string, { minor: number; byCategory: Map<string | null, number> }>()
  for (const r of rows) {
    if (!matchesSearch(r.description, f.search)) continue
    count++
    if (mixed && r.amount < 0 && billCovered(r, cards)) {
      cardBills += r.amount
      continue
    }
    if (!countsAsSpending(r.category)) continue
    if (r.amount < 0) {
      spent += r.amount
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.amount)
      const acct = byAccount.get(r.accountId) ?? { minor: 0, byCategory: new Map() }
      byAccount.set(r.accountId, acct)
      acct.minor += r.amount
      acct.byCategory.set(r.category, (acct.byCategory.get(r.category) ?? 0) + r.amount)
    } else received += r.amount
  }
  return {
    spent,
    received,
    count,
    /** Card bills paid from a bank account that were left out (only when mixing kinds). */
    cardBills,
    byCategory: [...byCategory]
      .map(([category, minor]) => ({ category, minor }))
      .sort((a, b) => a.minor - b.minor),
    /** Spending per account, largest first, each split by category. */
    byAccount: [...byAccount]
      .map(([accountId, a]) => ({
        accountId,
        minor: a.minor,
        byCategory: [...a.byCategory]
          .map(([category, minor]) => ({ category, minor }))
          .sort((x, y) => x.minor - y.minor),
      }))
      .sort((a, b) => a.minor - b.minor),
  }
}

/** Spending for each of the given months, under the same filter. */
export async function monthlySpending(
  db: Conn,
  member: MemberRow,
  f: Omit<TransactionFilter, 'month'>,
  months: string[],
) {
  const sums = await Promise.all(months.map((month) => totals(db, member, { ...f, month })))
  return months.map((month, i) => ({ month, spent: sums[i]!.spent }))
}

/** This month's money out and in for each visible account. */
export async function accountSummaries(db: Conn, member: MemberRow, month: string) {
  const [from, to] = monthRange(month)
  const rows = await db
    .select({
      account: accounts,
      category: transactions.category,
      amount: transactions.amountMinor,
    })
    .from(accounts)
    .leftJoin(
      transactions,
      and(
        eq(transactions.accountId, accounts.id),
        gte(transactions.occurredOn, from),
        lt(transactions.occurredOn, to),
      ),
    )
    .where(visibleTo(member))
    .orderBy(accounts.createdAt)
  const byAccount = new Map<
    string,
    { account: AccountRow; out: number; in: number; count: number }
  >()
  for (const r of rows) {
    const entry = byAccount.get(r.account.id) ?? { account: r.account, out: 0, in: 0, count: 0 }
    byAccount.set(r.account.id, entry)
    if (r.amount === null) continue
    entry.count++
    if (!countsAsSpending(r.category)) continue
    if (r.amount < 0) entry.out += r.amount
    else entry.in += r.amount
  }
  return [...byAccount.values()]
}

/** Months that have transactions, newest first. */
export async function listMonths(db: Conn, member: MemberRow) {
  const rows = await db
    .selectDistinct({ month: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')` })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(visibleTo(member))
    .orderBy(desc(sql`to_char(${transactions.occurredOn}, 'YYYY-MM')`))
  return rows.map((r) => r.month)
}

/** Someone checked an alert and it's fine: hide it, and don't raise it again. */
export async function dismissAlert(db: Conn, member: MemberRow, transactionId: string) {
  assertEditor(member)
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(visibleTo(member), eq(transactions.id, transactionId)))
  if (!row) throw new AuthError('not_found', 'That transaction isn’t here')
  await db
    .update(transactions)
    .set({ alertDismissedAt: new Date() })
    .where(eq(transactions.id, transactionId))
}

/**
 * Set a transaction's category. With `remember`, also file every other transaction with the
 * same description there (except ones someone set by hand) and do so for future imports.
 */
export async function setCategory(
  db: Conn,
  member: MemberRow,
  transactionId: string,
  category: string | null,
  remember = false,
) {
  assertEditor(member)
  if (category !== null && !(await householdCategorySet(db, member.householdId)).has(category))
    throw new AuthError('not_found', 'Unknown category')
  const [row] = await db
    .select({ t: transactions })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(visibleTo(member), eq(transactions.id, transactionId)))
  if (!row) throw new AuthError('not_found', 'That transaction isn’t here')
  await db
    .update(transactions)
    .set({
      category,
      // Cleared by hand stays 'manual', so the categorizer leaves it alone.
      categorySource: 'manual',
      categoryVia: null,
      categoryConfidence: null,
    })
    .where(eq(transactions.id, transactionId))
  let also = 0
  if (remember && category) {
    const key = row.t.descriptionKey
    await db
      .insert(categoryRules)
      .values({ householdId: member.householdId, match: key, category, createdBy: member.id })
      .onConflictDoUpdate({
        target: [categoryRules.householdId, categoryRules.match],
        set: { category, createdBy: member.id },
      })
    const updated = await db
      .update(transactions)
      .set({ category, categorySource: 'rule', categoryVia: null, categoryConfidence: null })
      .where(
        and(
          eq(transactions.householdId, member.householdId),
          eq(transactions.descriptionKey, key),
          or(
            isNull(transactions.categorySource),
            inArray(transactions.categorySource, ['rule', 'auto']),
          ),
        ),
      )
      .returning({ id: transactions.id })
    also = updated.length
  }
  return { also }
}
