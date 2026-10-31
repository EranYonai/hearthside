'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { resetCategorizer, scheduleCategorize } from '@/server/categorize'
import { canEdit, setCategory } from '@/server/ledger'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

export async function setCategoryAction(id: string, category: string | null, remember: boolean) {
  const { member } = await requireSession()
  return runAction(['/transactions', '/'], async () => {
    if (category !== null && typeof category !== 'string')
      throw new AuthError('not_found', 'Unknown category')
    return setCategory(requireDb(), member, id, category, remember)
  })
}

/** File entries that have no category yet, using rules, past choices, keywords and the model. */
export async function categorizeNowAction() {
  const { member } = await requireSession()
  return runAction(['/transactions', '/'], async () => {
    if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change data')
    const db = requireDb()
    await resetCategorizer(db, member.householdId, 'uncategorized')
    const job = scheduleCategorize(db, member.householdId)
    // Small batches finish here; big ones keep going after the answer.
    const done = await Promise.race([job, new Promise<null>((r) => setTimeout(r, 8000, null))])
    return done
      ? { filed: done.filed, waiting: done.waiting, background: false }
      : { filed: 0, waiting: false, background: true }
  })
}
