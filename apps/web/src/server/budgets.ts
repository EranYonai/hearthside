import {
  type BudgetLimit,
  type BudgetMonth,
  budgetMonth,
  decimalToMinor,
  isBudgetable,
  parseDecimal,
  suggestLimits,
} from '@hearthside/core'
import { type MemberRow, schema } from '@hearthside/db'
import { and, eq } from 'drizzle-orm'
import { householdCategorySet } from './categories'
import { canEdit, monthlyFlows } from './ledger'
import { audit, AuthError } from './repo'

const { budgets } = schema

type Conn = Parameters<typeof audit>[0]

/** Limits up to this many whole units a month; anything above is a typo. */
const MAX_LIMIT_MINOR = 100_000_000 * 100

/** The household's monthly limits, for categories that still exist. */
export async function listBudgets(db: Conn, member: MemberRow): Promise<BudgetLimit[]> {
  const [rows, categories] = await Promise.all([
    db
      .select({ category: budgets.category, limitMinor: budgets.limitMinor })
      .from(budgets)
      .where(eq(budgets.householdId, member.householdId)),
    householdCategorySet(db, member.householdId),
  ])
  return rows.filter((r) => categories.has(r.category))
}

/** The categories a budget can be set on: money-out ones, built-in and the household's own. */
export async function budgetableCategories(db: Conn, member: MemberRow) {
  const categories = await householdCategorySet(db, member.householdId)
  const incoming = new Set(categories.custom.filter((c) => c.direction === 'in').map((c) => c.slug))
  return categories.all.filter((c) => isBudgetable(c.slug) && !incoming.has(c.slug))
}

/** Read what someone typed as a monthly limit; empty or zero means "no budget". */
export function parseLimit(input: unknown): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'string' && input.trim() === '') return null
  const decimal = parseDecimal(input as string)
  const minor = decimal === null ? null : decimalToMinor(decimal)
  if (minor === null || minor < 0 || !Number.isSafeInteger(minor))
    throw new AuthError('not_allowed', 'Enter an amount, like 1500.')
  if (minor > MAX_LIMIT_MINOR) throw new AuthError('not_allowed', 'That limit is too big.')
  return minor === 0 ? null : minor
}

/** Set a category's monthly limit for the household, or clear it with an empty amount. */
export async function setBudget(
  db: Conn,
  member: MemberRow,
  category: string,
  amount: unknown,
  now = new Date(),
): Promise<void> {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change budgets')
  const allowed = await budgetableCategories(db, member)
  if (!allowed.some((c) => c.slug === category))
    throw new AuthError('not_found', 'That category can’t have a budget')
  const limit = parseLimit(amount)
  const where = and(eq(budgets.householdId, member.householdId), eq(budgets.category, category))
  if (limit === null) {
    await db.delete(budgets).where(where)
  } else {
    await db
      .insert(budgets)
      .values({
        householdId: member.householdId,
        category,
        limitMinor: limit,
        updatedBy: member.id,
      })
      .onConflictDoUpdate({
        target: [budgets.householdId, budgets.category],
        set: { limitMinor: limit, updatedBy: member.id, updatedAt: now },
      })
  }
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: limit === null ? 'budget.cleared' : 'budget.set',
    detail: { category },
  })
}

/** Set several limits at once (the "use suggestions" button). Existing limits stay. */
export async function addBudgets(
  db: Conn,
  member: MemberRow,
  limits: readonly BudgetLimit[],
): Promise<number> {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change budgets')
  const allowed = new Set((await budgetableCategories(db, member)).map((c) => c.slug))
  const fresh = limits.filter(
    (l) => allowed.has(l.category) && Number.isSafeInteger(l.limitMinor) && l.limitMinor > 0,
  )
  if (!fresh.length) return 0
  const added = await db
    .insert(budgets)
    .values(
      fresh.map((l) => ({
        householdId: member.householdId,
        category: l.category,
        limitMinor: Math.min(l.limitMinor, MAX_LIMIT_MINOR),
        updatedBy: member.id,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: budgets.id })
  if (added.length)
    await audit(db, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'budget.set',
      detail: { count: added.length },
    })
  return added.length
}

/** The `count` months before `month` (YYYY-MM), oldest first. */
export function monthsBefore(month: string, count: number): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(y, m - 1 - (count - i), 1)).toISOString().slice(0, 7),
  )
}

export interface BudgetOverview {
  limits: BudgetLimit[]
  month: BudgetMonth
  /** Starting limits from the three months before, for categories with no budget yet. */
  suggestions: BudgetLimit[]
}

/**
 * Budgets against a month's spending on the accounts this member can see, with the same rules
 * as Activity (card bills paid from the bank aren't counted twice, transfers aren't spending).
 */
export async function budgetOverview(
  db: Conn,
  member: MemberRow,
  month: string,
  now = new Date(),
): Promise<BudgetOverview> {
  const before = monthsBefore(month, 3)
  const [limits, flows, allowed] = await Promise.all([
    listBudgets(db, member),
    monthlyFlows(db, member, {}, [...before, month]),
    budgetableCategories(db, member),
  ])
  const set = new Set(limits.map((l) => l.category))
  const ok = new Set(allowed.map((c) => c.slug))
  return {
    limits,
    month: budgetMonth(limits, flows.at(-1)!, now.toISOString().slice(0, 10)),
    suggestions: suggestLimits(flows.slice(0, 3)).filter(
      (s) => ok.has(s.category) && !set.has(s.category),
    ),
  }
}
