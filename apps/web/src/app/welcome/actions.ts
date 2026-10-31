'use server'

import { requireDb } from '@/lib/db'
import { runAction } from '@/server/action'
import { setOnboarded, updateProfile } from '@/server/profile'
import { requireSession } from '@/server/session'

export async function saveProfileAction(input: {
  name: string
  displayCurrency: string
  householdName?: string
}) {
  const { member } = await requireSession()
  return runAction(['/welcome', '/settings', '/'], async () => {
    await updateProfile(requireDb(), member, input)
    return {}
  })
}

/** Finish or skip the welcome steps. */
export async function finishWelcomeAction() {
  const { member } = await requireSession()
  return runAction(['/'], async () => {
    await setOnboarded(requireDb(), member, true)
    return {}
  })
}

/** From Settings: walk through the welcome steps again. */
export async function restartWelcomeAction() {
  const { member } = await requireSession()
  return runAction(['/'], async () => {
    await setOnboarded(requireDb(), member, false)
    return {}
  })
}
