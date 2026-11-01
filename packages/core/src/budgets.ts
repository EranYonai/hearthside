import type { MonthFlow } from './cashflow'
import type { Minor } from './money'

/** Categories that never get a budget: money coming in, or moving between own accounts. */
const NOT_BUDGETED = new Set(['income', 'savings', 'transfer'])

export function isBudgetable(category: string | null | undefined): category is string {
  return Boolean(category) && !NOT_BUDGETED.has(category!)
}

/** How a category is doing against its limit. */
export type BudgetStatus = 'ok' | 'near' | 'over'

/** At this share of the limit a budget is "near" (amber). */
export const NEAR_SHARE = 0.8

export interface BudgetLimit {
  category: string
  /** Monthly limit, positive minor units. */
  limitMinor: Minor
}

export interface BudgetLine {
  category: string
  limitMinor: Minor
  /** Spent this month, positive. Refunds can bring it below zero; it's clamped to 0. */
  spentMinor: Minor
  /** Limit minus spent; negative when over. */
  leftMinor: Minor
  /** Spent over limit, 0..∞. */
  share: number
  status: BudgetStatus
}

export interface BudgetMonth {
  month: string
  lines: BudgetLine[]
  /** Sum of the limits. */
  limitMinor: Minor
  /** Spent in budgeted categories, positive. */
  spentMinor: Minor
  leftMinor: Minor
  share: number
  status: BudgetStatus
  /** Spent in categories with no budget (uncategorized included), positive. */
  outsideMinor: Minor
  /** How far through the month `today` is, 0..1; 1 for past months, 0 for future ones. */
  elapsed: number
}

export function budgetStatus(spent: Minor, limit: Minor): BudgetStatus {
  if (limit <= 0) return spent > 0 ? 'over' : 'ok'
  if (spent > limit) return 'over'
  return spent >= limit * NEAR_SHARE ? 'near' : 'ok'
}

/** Share of `month` (YYYY-MM) that has passed by `today` (YYYY-MM-DD), counting today. */
export function monthElapsed(month: string, today: string): number {
  const current = today.slice(0, 7)
  if (month < current) return 1
  if (month > current) return 0
  const [y, m] = month.split('-').map(Number) as [number, number]
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Math.min(1, Number(today.slice(8, 10)) / days)
}

/**
 * Each budget against a month's spending. Lines are ordered by how close they are to the
 * limit, most used first, so the ones to watch lead.
 */
export function budgetMonth(
  limits: readonly BudgetLimit[],
  flow: MonthFlow,
  today: string,
): BudgetMonth {
  const lines = limits
    .filter((l) => l.limitMinor > 0)
    .map((l): BudgetLine => {
      const spent = Math.max(0, -(flow.byCategory[l.category] ?? 0))
      return {
        category: l.category,
        limitMinor: l.limitMinor,
        spentMinor: spent,
        leftMinor: l.limitMinor - spent,
        share: spent / l.limitMinor,
        status: budgetStatus(spent, l.limitMinor),
      }
    })
    .sort((a, b) => b.share - a.share || b.limitMinor - a.limitMinor)
  const budgeted = new Set(lines.map((l) => l.category))
  const limit = lines.reduce((n, l) => n + l.limitMinor, 0)
  const spent = lines.reduce((n, l) => n + l.spentMinor, 0)
  const outside = Object.entries(flow.byCategory)
    .filter(([category]) => !budgeted.has(category))
    .reduce((n, [, minor]) => n - minor, 0)
  return {
    month: flow.month,
    lines,
    limitMinor: limit,
    spentMinor: spent,
    leftMinor: limit - spent,
    share: limit ? spent / limit : 0,
    status: budgetStatus(spent, limit),
    outsideMinor: Math.max(0, outside),
    elapsed: monthElapsed(flow.month, today),
  }
}

/** Round a suggestion up to a tidy number: tens below 1,000, fifties up to 5,000, then hundreds. */
export function tidyLimit(minor: Minor): Minor {
  const major = Math.ceil(Math.max(0, minor) / 100)
  const step = major < 1000 ? 10 : major <= 5000 ? 50 : 100
  return Math.ceil(major / step) * step * 100
}

/**
 * A starting limit per category: the average monthly spending over the given months (months with
 * no money moving at all don't count), rounded up to a tidy number. Largest first.
 */
export function suggestLimits(flows: readonly MonthFlow[]): BudgetLimit[] {
  const active = flows.filter((f) => f.spent || f.received)
  if (!active.length) return []
  const totals = new Map<string, Minor>()
  for (const f of active)
    for (const [category, minor] of Object.entries(f.byCategory))
      if (isBudgetable(category)) totals.set(category, (totals.get(category) ?? 0) - minor)
  return [...totals]
    .map(([category, minor]) => ({ category, limitMinor: tidyLimit(minor / active.length) }))
    .filter((l) => l.limitMinor > 0)
    .sort((a, b) => b.limitMinor - a.limitMinor)
}
