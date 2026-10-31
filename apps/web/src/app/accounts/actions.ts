'use server'

import { isProviderId, normalizeHexColor } from '@hearthside/core'
import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { cleanName } from '@/server/http'
import { deleteAccount, updateAccount, type AccountVisibility } from '@/server/ledger'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'

const VISIBILITIES: AccountVisibility[] = ['household', 'private']

export async function updateAccountAction(
  id: string,
  input: {
    name: string
    holderId: string
    visibility: AccountVisibility
    provider: string | null
    color: string | null
  },
) {
  const { member } = await requireSession()
  return runAction(['/accounts', '/transactions', '/import', '/'], async () => {
    const name = cleanName(input.name)
    if (!name) throw new AuthError('not_allowed', 'Give the account a name')
    if (!VISIBILITIES.includes(input.visibility))
      throw new AuthError('not_allowed', 'Pick who can see it')
    if (input.provider !== null && !isProviderId(input.provider))
      throw new AuthError('not_allowed', 'Pick a provider from the list')
    const color = input.color === null ? null : normalizeHexColor(input.color)
    if (input.color !== null && !color) throw new AuthError('not_allowed', 'Pick a valid color')
    await updateAccount(requireDb(), member, id, {
      name,
      holderId: input.holderId,
      visibility: input.visibility,
      provider: input.provider,
      color,
    })
    return {}
  })
}

export async function deleteAccountAction(id: string) {
  const { member } = await requireSession()
  return runAction(['/accounts', '/transactions', '/import', '/'], () =>
    deleteAccount(requireDb(), member, id),
  )
}
