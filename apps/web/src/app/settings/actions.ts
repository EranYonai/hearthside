'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { isCategoryIcon } from '@hearthside/core'
import { requireDb } from '@/lib/db'
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from '@/server/categories'
import { resetCategorizer, scheduleCategorize } from '@/server/categorize'
import { authConfig } from '@/server/config'
import {
  AuthError,
  approveMember,
  changeRole,
  createInvite,
  regenerateRecoveryCodes,
  removeMember,
  removePasskey,
  revokeInvite,
  type Role,
} from '@/server/repo'
import { createAppInvite, markRequestHandled, revokeAppInvite } from '@/server/app-invites'
import { setBackupKey } from '@/server/backups'
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
    return { url: `${await appOrigin()}/invite/${token}` }
  })
}

/** Prefer the configured origin; fall back to the request host for local testing. */
async function appOrigin() {
  const host = (await headers()).get('host')
  return process.env.APP_ORIGIN ? authConfig().origin : `http://${host}`
}

/** "Invite a friend to Hearthside": any member; the friend creates their own home. */
export async function createAppInviteAction() {
  const { member } = await requireSession()
  return run(async () => {
    const { token } = await createAppInvite(requireDb(), member)
    return { url: `${await appOrigin()}/join/${token}` }
  })
}

export async function revokeAppInviteAction(id: string) {
  const { member } = await requireSession()
  return run(async () => {
    await revokeAppInvite(requireDb(), member, id)
    return {}
  })
}

/** Server admin: answer a request from the public page with a friend invite link. */
export async function answerRequestAction(id: string) {
  const { member } = await requireSession()
  return run(async () => {
    const db = requireDb()
    await markRequestHandled(db, member, id)
    const { token } = await createAppInvite(db, member)
    return { url: `${await appOrigin()}/join/${token}` }
  })
}

export async function dismissRequestAction(id: string) {
  const { member } = await requireSession()
  return run(async () => {
    await markRequestHandled(requireDb(), member, id)
    return {}
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

export async function approveMemberAction(memberId: string) {
  const { member } = await requireSession()
  return run(async () => {
    await approveMember(requireDb(), member, String(memberId))
    revalidatePath('/')
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

export interface CategoryForm {
  label: string
  icon: string
  direction: 'out' | 'in'
  keywords: string
}

function categoryInput(form: CategoryForm): CategoryInput {
  if (!isCategoryIcon(form.icon)) throw new AuthError('not_found', 'Pick an icon')
  return {
    label: String(form.label ?? ''),
    icon: form.icon,
    direction: form.direction === 'in' ? 'in' : 'out',
    keywords: String(form.keywords ?? '').split(','),
  }
}

/** After categories change, give waiting entries another look with the new words. */
async function refileAfterChange(householdId: string) {
  const db = requireDb()
  await resetCategorizer(db, householdId, 'uncategorized')
  void scheduleCategorize(db, householdId)
  revalidatePath('/transactions')
  revalidatePath('/')
}

export async function createCategoryAction(form: CategoryForm) {
  const { member } = await requireSession()
  return run(async () => {
    const result = await createCategory(requireDb(), member, categoryInput(form))
    await refileAfterChange(member.householdId)
    return result
  })
}

export async function updateCategoryAction(slug: string, form: CategoryForm) {
  const { member } = await requireSession()
  return run(async () => {
    await updateCategory(requireDb(), member, String(slug), categoryInput(form))
    await refileAfterChange(member.householdId)
    return {}
  })
}

export async function deleteCategoryAction(slug: string) {
  const { member } = await requireSession()
  return run(async () => {
    const result = await deleteCategory(requireDb(), member, String(slug))
    await refileAfterChange(member.householdId)
    return result
  })
}

/** Links the owner's passkey as a second backup key. Only the public half arrives here. */
export async function linkBackupKeyAction(key: { recipient: string; credentialId: string } | null) {
  const { member } = await requireSession()
  return run(async () => {
    await setBackupKey(requireDb(), member, key)
    return {}
  })
}
