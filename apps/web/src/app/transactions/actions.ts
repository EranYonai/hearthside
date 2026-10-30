'use server'

import { isCategory } from '@hearthside/core'
import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { setCategory } from '@/server/ledger'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

export async function setCategoryAction(id: string, category: string | null, remember: boolean) {
  const { member } = await requireSession()
  return runAction(['/transactions', '/'], async () => {
    if (category !== null && !isCategory(category))
      throw new AuthError('not_found', 'Unknown category')
    return setCategory(requireDb(), member, id, category, remember)
  })
}
