'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { cleanName } from '@/server/http'
import { updateAccount, type AccountVisibility } from '@/server/ledger'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

const VISIBILITIES: AccountVisibility[] = ['household', 'private']

export async function updateAccountAction(
  id: string,
  input: { name: string; holderId: string; visibility: AccountVisibility },
) {
  const { member } = await requireSession()
  return runAction(['/accounts', '/transactions', '/import', '/'], async () => {
    const name = cleanName(input.name)
    if (!name) throw new AuthError('not_allowed', 'Give the account a name')
    if (!VISIBILITIES.includes(input.visibility))
      throw new AuthError('not_allowed', 'Pick who can see it')
    await updateAccount(requireDb(), member, id, { ...input, name })
    return {}
  })
}
