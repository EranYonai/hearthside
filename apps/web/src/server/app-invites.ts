import type { Db, MemberRow } from '@hearthside/db'
import { blindIndex, schema } from '@hearthside/db'
import { and, count, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { INVITE_TTL_MS } from './config'
import {
  AuthError,
  audit,
  countRecent,
  insertHousehold,
  isApproved,
  type NewHome,
  type Tx,
} from './repo'
import { randomToken, sha256 } from './tokens'

// Two kinds of invite:
// - a home invite (repo.ts `invites`) lets someone join YOUR home; only the owner sends it.
// - a friend invite (here, `app_invites`) lets someone create their OWN, separate home; any
//   approved member sends it. That keeps sign-up closed to bots while anyone can bring a friend.

const { appInvites, inviteRequests, members, households } = schema
type Conn = Db | Tx

function assertMember(actor: MemberRow) {
  if (actor.removedAt || !isApproved(actor))
    throw new AuthError('not_allowed', 'You can invite friends once you’re in your home')
}

export async function createAppInvite(db: Conn, actor: MemberRow, now = new Date()) {
  assertMember(actor)
  const token = randomToken(24)
  const [invite] = await db
    .insert(appInvites)
    .values({
      tokenHash: sha256(token),
      createdBy: actor.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .returning()
  await audit(db, {
    householdId: actor.householdId,
    memberId: actor.id,
    action: 'app_invite.created',
  })
  return { token, invite: invite! }
}

/** The member's own friend invites: the open ones, and how many friends have joined. */
export async function appInviteSummary(db: Conn, actor: MemberRow, now = new Date()) {
  const mine = eq(appInvites.createdBy, actor.id)
  const [open, joinedRows] = await Promise.all([
    db
      .select()
      .from(appInvites)
      .where(
        and(
          mine,
          isNull(appInvites.usedAt),
          isNull(appInvites.revokedAt),
          gt(appInvites.expiresAt, now),
        ),
      )
      .orderBy(desc(appInvites.createdAt)),
    db
      .select({ value: count() })
      .from(appInvites)
      .where(and(mine, isNotNull(appInvites.usedAt))),
  ])
  return { open, joined: joinedRows[0]?.value ?? 0 }
}

export async function revokeAppInvite(db: Conn, actor: MemberRow, id: string) {
  await db
    .update(appInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(appInvites.id, id), eq(appInvites.createdBy, actor.id)))
  await audit(db, {
    householdId: actor.householdId,
    memberId: actor.id,
    action: 'app_invite.revoked',
  })
}

/** An open friend invite and the first name of whoever sent it (shown on the join page). */
export async function findOpenAppInvite(db: Conn, token: string, now = new Date()) {
  const [row] = await db
    .select({ invite: appInvites, inviterName: members.name })
    .from(appInvites)
    .innerJoin(members, eq(members.id, appInvites.createdBy))
    .where(
      and(
        eq(appInvites.tokenHash, sha256(token)),
        isNull(appInvites.usedAt),
        isNull(appInvites.revokedAt),
        isNull(members.removedAt),
        gt(appInvites.expiresAt, now),
      ),
    )
  return row
}

/** Single use: the conditional update means two people can't redeem the same link. */
export async function createHomeFromInvite(db: Db, token: string, input: NewHome) {
  return db.transaction(async (tx) => {
    const open = await findOpenAppInvite(tx, token)
    if (!open) throw new AuthError('invite_invalid', 'This invite link is no longer valid')
    const created = await insertHousehold(tx, input)
    const claimed = await tx
      .update(appInvites)
      .set({ usedAt: new Date(), usedFor: created.household.id })
      .where(and(eq(appInvites.id, open.invite.id), isNull(appInvites.usedAt)))
      .returning()
    if (claimed.length === 0)
      throw new AuthError('invite_invalid', 'This invite link is no longer valid')
    return created
  })
}

// ---------- "Request an invite" on the public page ----------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const REQUESTS_PER_IP_PER_HOUR = 5
export const REQUESTS_PER_HOUR = 200

export function cleanEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const email = value.trim()
  return email.length <= 254 && EMAIL.test(email) ? email : undefined
}

export class RateLimited extends Error {}

/**
 * Saves a request. The same address asking twice is quietly kept as one, and the answer is
 * the same either way, so the page never reveals who has asked.
 */
export async function requestInvite(db: Conn, email: string, ip: string | null, now = new Date()) {
  const since = new Date(now.getTime() - 60 * 60 * 1000)
  if (
    (ip && (await countRecent(db, 'invite.requested', since, ip)) >= REQUESTS_PER_IP_PER_HOUR) ||
    (await countRecent(db, 'invite.requested', since)) >= REQUESTS_PER_HOUR
  )
    throw new RateLimited('Too many requests. Please try again later.')
  await db
    .insert(inviteRequests)
    .values({ email, emailKey: blindIndex(email.toLowerCase()), createdAt: now })
    .onConflictDoNothing()
  await audit(db, { action: 'invite.requested', ip })
}

function assertServerAdmin(actor: MemberRow) {
  if (!actor.serverAdmin || actor.removedAt)
    throw new AuthError('not_allowed', 'Only whoever runs this server sees invite requests')
}

export async function listInviteRequests(db: Conn, actor: MemberRow) {
  assertServerAdmin(actor)
  return db
    .select()
    .from(inviteRequests)
    .where(isNull(inviteRequests.handledAt))
    .orderBy(desc(inviteRequests.createdAt))
}

export async function markRequestHandled(db: Conn, actor: MemberRow, id: string) {
  assertServerAdmin(actor)
  await db.update(inviteRequests).set({ handledAt: new Date() }).where(eq(inviteRequests.id, id))
}

/** How many homes this server holds, for the admin. */
export async function countHomes(db: Conn, actor: MemberRow) {
  assertServerAdmin(actor)
  const [row] = (await db.select({ value: count() }).from(households)) as [{ value: number }]
  return row.value
}
