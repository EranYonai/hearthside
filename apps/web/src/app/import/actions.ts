'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { cleanName } from '@/server/http'
import { createAccount, undoBatch, type AccountKind, type AccountVisibility } from '@/server/ledger'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

const KINDS: AccountKind[] = ['card', 'bank', 'other']
const VISIBILITIES: AccountVisibility[] = ['household', 'private']

export async function createAccountAction(input: {
  name: string
  kind: AccountKind
  visibility: AccountVisibility
}) {
  const { member } = await requireSession()
  return runAction(['/import'], async () => {
    const name = cleanName(input.name)
    if (!name) throw new AuthError('not_allowed', 'Give the account a name')
    if (!KINDS.includes(input.kind) || !VISIBILITIES.includes(input.visibility))
      throw new AuthError('not_allowed', 'Pick a type and who can see it')
    const account = await createAccount(requireDb(), member, { ...input, name })
    return { id: account.id }
  })
}

export async function undoImportAction(batchId: string) {
  const { member } = await requireSession()
  return runAction(['/import', '/transactions', '/'], async () => {
    await undoBatch(requireDb(), member, batchId)
    return {}
  })
}
