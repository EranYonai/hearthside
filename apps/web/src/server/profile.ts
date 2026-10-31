import type { MemberRow } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { eq } from 'drizzle-orm'
import { isDisplayCurrency } from '../lib/onboarding'
import { cleanName } from './http'
import { audit, AuthError } from './repo'

const { households, members } = schema

type Conn = Parameters<typeof audit>[0]

/** A member's own name and display currency; the owner may also rename the home. */
export async function updateProfile(
  db: Conn,
  member: MemberRow,
  input: { name: unknown; displayCurrency: unknown; householdName?: unknown },
) {
  const name = cleanName(input.name)
  if (!name) throw new AuthError('not_allowed', 'Enter your name, up to 60 characters')
  if (!isDisplayCurrency(input.displayCurrency))
    throw new AuthError('not_allowed', 'Pick a currency from the list')
  let householdName: string | undefined
  if (input.householdName !== undefined) {
    if (member.role !== 'owner') throw new AuthError('not_allowed', 'Only the owner can do that')
    householdName = cleanName(input.householdName)
    if (!householdName) throw new AuthError('not_allowed', 'Enter a name for your home')
  }
  const [row] = await db
    .update(members)
    .set({ name, displayCurrency: input.displayCurrency })
    .where(eq(members.id, member.id))
    .returning()
  if (householdName)
    await db
      .update(households)
      .set({ name: householdName })
      .where(eq(households.id, member.householdId))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'member.profile_updated',
    detail: { displayCurrency: input.displayCurrency, renamedHome: !!householdName },
  })
  return row!
}

/** Finishing (or skipping) the welcome steps; `false` shows them again. */
export async function setOnboarded(db: Conn, member: MemberRow, done: boolean, now = new Date()) {
  await db
    .update(members)
    .set({ onboardedAt: done ? now : null })
    .where(eq(members.id, member.id))
}
