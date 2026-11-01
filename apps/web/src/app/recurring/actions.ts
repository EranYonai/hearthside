'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { setDismissed } from '@/server/recurring'
import { requireSession } from '@/server/session'

/** Take a payee off the fixed costs list, or put it back. */
export async function dismissRecurringAction(payeeKey: string, restore: boolean) {
  const { member } = await requireSession()
  return runAction(['/recurring', '/'], async () => {
    await setDismissed(requireDb(), member, String(payeeKey), Boolean(restore))
    return {}
  })
}
