import {
  countsAsSpending,
  duplicateKeys,
  isCategory,
  normalizeDescription,
  type CategorySlug,
  type ParsedTransaction,
} from '@hearthside/core'
import type { AccountRow, MemberRow } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import { audit, AuthError, type Tx } from './repo'
import { sha256 } from './tokens'

const { accounts, importBatches, transactions, categoryRules } = schema

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

/** Accounts this member may see: shared ones and their own private ones. */
function visibleTo(member: MemberRow): SQL {
  return and(
    eq(accounts.householdId, member.householdId),
    or(eq(accounts.visibility, 'household'), eq(accounts.ownerId, member.id)),
  )!
}

// ---------- Accounts ----------

export async function listAccounts(db: Conn, member: MemberRow) {
  return db.select().from(accounts).where(visibleTo(member)).orderBy(accounts.createdAt)
}

export async function createAccount(
  db: Conn,
  member: MemberRow,
  input: { name: string; kind: AccountKind; visibility: AccountVisibility },
) {
  assertEditor(member)
  const [row] = await db
    .insert(accounts)
    .values({ householdId: member.householdId, ownerId: member.id, ...input })
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'account.created',
    detail: { accountId: row!.id, kind: input.kind },
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

// ---------- Import ----------

export interface PreparedRow extends ParsedTransaction {
  dedupKey: string
  duplicate: boolean
}

/** Hash the parser's duplicate keys and mark rows already stored for this account. */
export async function prepareImport(
  db: Conn,
  account: AccountRow,
  parsed: readonly ParsedTransaction[],
): Promise<PreparedRow[]> {
  const keys = duplicateKeys(parsed).map(sha256)
  const existing = new Set<string>()
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000)
    const rows = await db
      .select({ key: transactions.dedupKey })
      .from(transactions)
      .where(and(eq(transactions.accountId, account.id), inArray(transactions.dedupKey, chunk)))
    for (const r of rows) existing.add(r.key)
  }
  return parsed.map((t, i) => ({ ...t, dedupKey: keys[i]!, duplicate: existing.has(keys[i]!) }))
}

export async function findBatchByHash(db: Conn, accountId: string, fileHash: string) {
  const [row] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.accountId, accountId), eq(importBatches.fileHash, fileHash)))
    .limit(1)
  return row
}

async function ruleMap(db: Conn, householdId: string) {
  const rules = await db
    .select({ match: categoryRules.match, category: categoryRules.category })
    .from(categoryRules)
    .where(eq(categoryRules.householdId, householdId))
  return new Map(rules.map((r) => [r.match, r.category]))
}

export async function commitImport(
  db: Conn,
  member: MemberRow,
  account: AccountRow,
  input: { fileName: string; fileHash: string; rows: readonly PreparedRow[]; skipped: number },
) {
  if (account.ownerId !== member.id) throw new AuthError('not_allowed', 'Not your account')
  const run = async (tx: Tx) => {
    const rules = await ruleMap(tx, member.householdId)
    const [batch] = await tx
      .insert(importBatches)
      .values({
        householdId: member.householdId,
        accountId: account.id,
        memberId: member.id,
        fileName: input.fileName.slice(0, 200),
        fileHash: input.fileHash,
        added: 0,
        duplicates: 0,
        skipped: input.skipped,
      })
      .returning()
    const fresh = input.rows.filter((r) => !r.duplicate)
    let added = 0
    for (let i = 0; i < fresh.length; i += 500) {
      const values = fresh.slice(i, i + 500).map((r) => {
        const key = normalizeDescription(r.description)
        const category = rules.get(key)
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
          category: category ?? null,
          categorySource: category ? ('rule' as const) : null,
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
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'import.undone',
    detail: { batchId, removed: row.batch.added },
  })
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
  /** A category slug, or 'none' for uncategorized. */
  category?: string
  search?: string
}

function filterConditions(member: MemberRow, f: TransactionFilter): SQL {
  const [from, to] = monthRange(f.month)
  const conditions: SQL[] = [
    visibleTo(member),
    gte(transactions.occurredOn, from),
    lt(transactions.occurredOn, to),
  ]
  if (f.accountId) conditions.push(eq(transactions.accountId, f.accountId))
  if (f.category === 'none') conditions.push(isNull(transactions.category))
  else if (f.category && isCategory(f.category))
    conditions.push(eq(transactions.category, f.category))
  const q = f.search?.trim()
  if (q) conditions.push(ilike(transactions.description, `%${q.replace(/[\\%_]/g, '\\$&')}%`))
  return and(...conditions)!
}

export async function listTransactions(db: Conn, member: MemberRow, f: TransactionFilter) {
  return db
    .select({
      t: transactions,
      accountName: accounts.name,
      accountKind: accounts.kind,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(filterConditions(member, f))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt), transactions.id)
    .limit(1000)
}

/** Money out and in for the filter, leaving out transfers and savings. */
export async function totals(db: Conn, member: MemberRow, f: TransactionFilter) {
  const rows = await db
    .select({
      category: transactions.category,
      out: sql<string>`coalesce(sum(case when ${transactions.amountMinor} < 0 then ${transactions.amountMinor} else 0 end), 0)`,
      in: sql<string>`coalesce(sum(case when ${transactions.amountMinor} > 0 then ${transactions.amountMinor} else 0 end), 0)`,
      n: sql<string>`count(*)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(filterConditions(member, f))
    .groupBy(transactions.category)
  let spent = 0
  let received = 0
  let count = 0
  const byCategory: { category: string | null; minor: number }[] = []
  for (const r of rows) {
    count += Number(r.n)
    if (!countsAsSpending(r.category)) continue
    spent += Number(r.out)
    received += Number(r.in)
    if (Number(r.out) !== 0) byCategory.push({ category: r.category, minor: Number(r.out) })
  }
  byCategory.sort((a, b) => a.minor - b.minor)
  return { spent, received, count, byCategory }
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

/**
 * Set a transaction's category. With `remember`, also file every other transaction with the
 * same description there (except ones someone set by hand) and do so for future imports.
 */
export async function setCategory(
  db: Conn,
  member: MemberRow,
  transactionId: string,
  category: CategorySlug | null,
  remember = false,
) {
  assertEditor(member)
  if (category !== null && !isCategory(category))
    throw new AuthError('not_found', 'Unknown category')
  const [row] = await db
    .select({ t: transactions })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(visibleTo(member), eq(transactions.id, transactionId)))
  if (!row) throw new AuthError('not_found', 'That transaction isn’t here')
  await db
    .update(transactions)
    .set({ category, categorySource: category ? 'manual' : null })
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
      .set({ category, categorySource: 'rule' })
      .where(
        and(
          eq(transactions.householdId, member.householdId),
          eq(transactions.descriptionKey, key),
          or(isNull(transactions.categorySource), eq(transactions.categorySource, 'rule')),
        ),
      )
      .returning({ id: transactions.id })
    also = updated.length
  }
  return { also }
}
