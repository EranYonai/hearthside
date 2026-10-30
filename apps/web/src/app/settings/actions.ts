'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireDb } from '@/lib/db'
import { authConfig } from '@/server/config'
import {
  AuthError,
  changeRole,
  createInvite,
  regenerateRecoveryCodes,
  removeMember,
  removePasskey,
  revokeInvite,
  type Role,
} from '@/server/repo'
import { requireSession } from '@/server/session'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn()
    revalidatePath('/settings')
    return { ok: true, ...value }
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message }
    console.error(
      JSON.stringify({ level: 'error', msg: 'settings action failed', error: String(err) }),
    )
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function createInviteAction(role: 'adult' | 'viewer') {
  const { member } = await requireSession()
  return run(async () => {
    if (role !== 'adult' && role !== 'viewer') throw new AuthError('not_allowed', 'Pick a role')
    const { token } = await createInvite(requireDb(), member, role)
    // Prefer the configured origin; fall back to the request host for local testing.
    const host = (await headers()).get('host')
    const origin = process.env.APP_ORIGIN ? authConfig().origin : `http://${host}`
    return { url: `${origin}/invite/${token}` }
  })
}

export async function revokeInviteAction(inviteId: string) {
  const { member } = await requireSession()
  return run(async () => {
    await revokeInvite(requireDb(), member, inviteId)
    return {}
  })
}

export async function changeRoleAction(memberId: string, role: Role) {
  const { member } = await requireSession()
  return run(async () => {
    await changeRole(requireDb(), member, memberId, role)
    return {}
  })
}

export async function removeMemberAction(memberId: string) {
  const { member } = await requireSession()
  return run(async () => {
    await removeMember(requireDb(), member, memberId)
    return {}
  })
}

export async function removePasskeyAction(passkeyId: string) {
  const { member } = await requireSession()
  return run(async () => {
    await removePasskey(requireDb(), member, passkeyId)
    return {}
  })
}

export async function regenerateCodesAction() {
  const { member } = await requireSession()
  return run(async () => ({ codes: await regenerateRecoveryCodes(requireDb(), member) }))
}
