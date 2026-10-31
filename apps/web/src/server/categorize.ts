import {
  categorySet,
  categorizeFast,
  categorizeMany,
  historyFrom,
  httpEngine,
  type CategorizeContext,
  type CategorySuggestion,
  type DecisionEngine,
} from '@hearthside/core'
import { schema } from '@hearthside/db'
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { listCustomCategories } from './categories'
import type { audit } from './repo'

const { accounts, transactions, categoryRules } = schema

type Conn = Parameters<typeof audit>[0]

/** The local model service, when DECIDE_URL points at one. */
let engineCache: DecisionEngine | null | undefined
export function decisionEngine(): DecisionEngine | null {
  if (engineCache === undefined)
    engineCache = process.env.DECIDE_URL ? httpEngine({ url: process.env.DECIDE_URL }) : null
  return engineCache
}

/** Rules and past manual choices for a household: everything but the model. */
export async function loadContext(db: Conn, householdId: string): Promise<CategorizeContext> {
  const [rules, picks] = await Promise.all([
    db
      .select({ match: categoryRules.match, category: categoryRules.category })
      .from(categoryRules)
      .where(eq(categoryRules.householdId, householdId)),
    db
      .select({
        descriptionKey: transactions.descriptionKey,
        category: sql<string>`${transactions.category}`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(eq(transactions.householdId, householdId), eq(transactions.categorySource, 'manual')),
      )
      .groupBy(transactions.descriptionKey, transactions.category),
  ])
  const custom = await listCustomCategories(db, householdId)
  return {
    rules: new Map(rules.map((r) => [r.match, r.category])),
    history: historyFrom(picks, categorySet(custom)),
    custom,
  }
}

/** Columns to write for a suggestion. Rules keep their own source so they stay "rule". */
export function categoryColumns(s: CategorySuggestion) {
  if (!s.category)
    return { category: null, categorySource: null, categoryVia: null, categoryConfidence: null }
  return {
    category: s.category,
    categorySource: s.via === 'rule' ? ('rule' as const) : ('auto' as const),
    categoryVia: s.via === 'rule' ? null : s.via,
    categoryConfidence: s.via === 'rule' ? null : s.confidence,
  }
}

/** For import: file what rules, history and keywords can, without waiting for the model. */
export function quickCategory(
  ctx: CategorizeContext,
  row: { description: string; descriptionKey: string; amountMinor: number },
) {
  return categoryColumns(categorizeFast(row, ctx))
}

export interface CategorizeRun {
  /** Entries the categorizer looked at. */
  looked: number
  /** Entries it filed. */
  filed: number
  /** True when the model was unavailable and some entries wait for it. */
  waiting: boolean
}

const PAGE = 256

/**
 * File every waiting entry in a household (no category, not yet seen by the model).
 * Entries the model can't place confidently are marked as seen, so they aren't asked again
 * until someone re-categorizes. Never touches manual or rule choices.
 */
export async function categorizePending(
  db: Conn,
  householdId: string,
  engine: DecisionEngine | null = decisionEngine(),
): Promise<CategorizeRun> {
  const ctx = { ...(await loadContext(db, householdId)), engine }
  const run: CategorizeRun = { looked: 0, filed: 0, waiting: false }
  let after = '00000000-0000-0000-0000-000000000000'
  for (;;) {
    const rows = await db
      .select({
        id: transactions.id,
        description: transactions.description,
        descriptionKey: transactions.descriptionKey,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        accountKind: accounts.kind,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.householdId, householdId),
          isNull(transactions.category),
          isNull(transactions.categorySource),
          isNull(transactions.categoryCheckedAt),
          gt(transactions.id, after),
        ),
      )
      .orderBy(asc(transactions.id))
      .limit(PAGE)
    if (rows.length === 0) break
    after = rows.at(-1)!.id
    const suggestions = await categorizeMany(rows, ctx)
    const now = new Date()
    for (let i = 0; i < rows.length; i++) {
      const s = suggestions[i]!
      if (s.retry) {
        run.waiting = true
        continue
      }
      // Without a model, only record what was found; leave the rest waiting for one.
      if (!s.category && !engine) continue
      const updated = await db
        .update(transactions)
        .set({ ...categoryColumns(s), categoryCheckedAt: engine ? now : null })
        // Someone may have picked a category meanwhile.
        .where(and(eq(transactions.id, rows[i]!.id), isNull(transactions.category)))
        .returning({ id: transactions.id })
      if (updated.length && s.category) run.filed++
    }
    run.looked += rows.length
    if (run.waiting) break
  }
  return run
}

export type RecategorizeScope = 'uncategorized' | 'auto'

/**
 * Mark entries for another look: 'uncategorized' asks again about entries with no category;
 * 'auto' also clears everything the categorizer filed, e.g. after a better model.
 * Then run categorizePending or scheduleCategorize.
 */
export async function resetCategorizer(db: Conn, householdId: string, scope: RecategorizeScope) {
  if (scope === 'auto')
    await db
      .update(transactions)
      .set({ category: null, categorySource: null, categoryVia: null, categoryConfidence: null })
      .where(
        and(eq(transactions.householdId, householdId), eq(transactions.categorySource, 'auto')),
      )
  // Entries someone cleared by hand keep source 'manual' and stay as they are.
  await db
    .update(transactions)
    .set({ categoryCheckedAt: null })
    .where(
      and(
        eq(transactions.householdId, householdId),
        isNull(transactions.category),
        isNull(transactions.categorySource),
      ),
    )
}

/** resetCategorizer, then categorize and wait for it. */
export async function recategorize(
  db: Conn,
  householdId: string,
  scope: RecategorizeScope,
  engine: DecisionEngine | null = decisionEngine(),
) {
  await resetCategorizer(db, householdId, scope)
  return categorizePending(db, householdId, engine)
}

const running = new Map<string, Promise<CategorizeRun>>()

/**
 * Categorize in the background, one run per household at a time. Used after an import so the
 * upload answers right away. Errors are logged, never thrown.
 */
export function scheduleCategorize(
  db: Conn,
  householdId: string,
): Promise<CategorizeRun | undefined> {
  const current = running.get(householdId)
  if (current) return current
  const job = categorizePending(db, householdId)
    .then((run) => {
      console.log(JSON.stringify({ level: 'info', msg: 'categorized', ...run }))
      return run
    })
    .catch((err: unknown) => {
      console.log(
        JSON.stringify({
          level: 'error',
          msg: 'categorize failed',
          err: err instanceof Error ? err.message : String(err),
        }),
      )
      return undefined
    })
    .finally(() => running.delete(householdId))
  running.set(householdId, job as Promise<CategorizeRun>)
  return job
}

/** At startup: pick up entries imported before the categorizer existed or while it was down. */
export async function sweepPending(db: Conn) {
  const households = await db
    .selectDistinct({ id: transactions.householdId })
    .from(transactions)
    .where(
      and(
        isNull(transactions.category),
        isNull(transactions.categorySource),
        isNull(transactions.categoryCheckedAt),
      ),
    )
  for (const h of households) await scheduleCategorize(db, h.id)
}
