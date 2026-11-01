'use server'

import type { BudgetLimit } from '@hearthside/core'
import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { addBudgets, setBudget } from '@/server/budgets'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

const PATHS = ['/budgets', '/', '/transactions']

/** Set a category's monthly limit, or clear it with an empty amount. */
export async function setBudgetAction(category: string, amount: string) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    await setBudget(requireDb(), member, String(category), String(amount ?? ''))
    return {}
  })
}

/** Start budgets from the suggested limits. Limits someone already set stay as they are. */
export async function addBudgetsAction(limits: BudgetLimit[]) {
  const { member } = await requireSession()
  return runAction(PATHS, async () => {
    if (!Array.isArray(limits) || limits.length > 100)
      throw new AuthError('not_allowed', 'Nothing to add')
    const clean = limits.map((l) => ({
      category: String(l?.category ?? ''),
      limitMinor: Number(l?.limitMinor),
    }))
    return { added: await addBudgets(requireDb(), member, clean) }
  })
}
