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
