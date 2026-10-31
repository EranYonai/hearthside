import type { Db, MemberRow, PasskeyRow } from '@hearthside/db'
import { blindIndex, schema } from '@hearthside/db'
import { and, asc, count, desc, eq, gt, isNull } from 'drizzle-orm'
import { CHALLENGE_TTL_MS, INVITE_TTL_MS, SESSION_REFRESH_MS, SESSION_TTL_MS } from './config'
import {
  RECOVERY_CODE_COUNT,
  normalizeRecoveryCode,
  randomToken,
  recoveryCode,
  sha256,
} from './tokens'

const {
  households,
  members,
  passkeys,
  sessions,
  invites,
  recoveryCodes,
  authChallenges,
  auditLog,
} = schema

export type Role = MemberRow['role']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Conn = Db | Tx

export interface NewPasskey {
  id: string
  publicKey: string
  counter: number
  transports: string[]
  deviceType: string
  backedUp: boolean
  name: string
}

export class AuthError extends Error {
  constructor(
    readonly code:
      | 'household_exists'
      | 'invite_invalid'
      | 'not_allowed'
      | 'last_passkey'
      | 'last_owner'
      | 'not_found',
    message: string,
  ) {
    super(message)
  }
}

// ---------- Household and members ----------

export async function getHousehold(db: Conn) {
  const [row] = await db.select().from(households).limit(1)
  return row
}

export async function createHousehold(
  db: Db,
  input: { householdName: string; ownerName: string; passkey: NewPasskey },
) {
  return db.transaction(async (tx) => {
    if (await getHousehold(tx))
      throw new AuthError('household_exists', 'This home is already set up')
    const [household] = await tx
      .insert(households)
      .values({ name: input.householdName })
      .returning()
    const [member] = await tx
      .insert(members)
      .values({ householdId: household!.id, name: input.ownerName, role: 'owner' })
      .returning()
    await tx.insert(passkeys).values({ ...input.passkey, memberId: member!.id })
    const codes = await replaceRecoveryCodes(tx, member!.id)
    await audit(tx, {
      householdId: household!.id,
      memberId: member!.id,
      action: 'household.created',
    })
    return { household: household!, member: member!, recoveryCodes: codes }
  })
}

export async function listMembers(db: Conn, householdId: string) {
  return db
    .select()
    .from(members)
    .where(and(eq(members.householdId, householdId), isNull(members.removedAt)))
    .orderBy(asc(members.createdAt))
}

function assertOwner(actor: MemberRow) {
  if (actor.role !== 'owner') throw new AuthError('not_allowed', 'Only the owner can do that')
}

export async function changeRole(db: Db, actor: MemberRow, memberId: string, role: Role) {
  assertOwner(actor)
  if (memberId === actor.id)
    throw new AuthError('last_owner', 'Hand over ownership before changing your own role')
  if (role === 'owner') throw new AuthError('not_allowed', 'A household has exactly one owner')
  const [row] = await db
    .update(members)
    .set({ role })
    .where(
      and(
        eq(members.id, memberId),
        eq(members.householdId, actor.householdId),
        isNull(members.removedAt),
      ),
    )
    .returning()
  if (!row) throw new AuthError('not_found', 'Member not found')
  await audit(db, {
    householdId: actor.householdId,
    memberId: actor.id,
    action: 'member.role_changed',
    detail: { memberId, role },
  })
  return row
}

/** Soft-removes the member and revokes everything that lets them sign in. */
export async function removeMember(db: Db, actor: MemberRow, memberId: string) {
  assertOwner(actor)
  if (memberId === actor.id) throw new AuthError('last_owner', 'The owner can’t remove themselves')
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(members)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(members.id, memberId),
          eq(members.householdId, actor.householdId),
          isNull(members.removedAt),
        ),
      )
      .returning()
    if (!row) throw new AuthError('not_found', 'Member not found')
    await tx.delete(sessions).where(eq(sessions.memberId, memberId))
    await tx.delete(passkeys).where(eq(passkeys.memberId, memberId))
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.memberId, memberId))
    await audit(tx, {
      householdId: actor.householdId,
      memberId: actor.id,
      action: 'member.removed',
      detail: { memberId },
    })
    return row
  })
}

// ---------- Passkeys ----------

export async function findPasskey(db: Conn, id: string) {
  const [row] = await db
    .select({ passkey: passkeys, member: members })
    .from(passkeys)
    .innerJoin(members, eq(members.id, passkeys.memberId))
    .where(and(eq(passkeys.id, id), isNull(members.removedAt)))
  return row
}

export async function markPasskeyUsed(db: Conn, id: string, counter: number) {
  await db.update(passkeys).set({ counter, lastUsedAt: new Date() }).where(eq(passkeys.id, id))
}

export async function listPasskeys(db: Conn, memberId: string): Promise<PasskeyRow[]> {
  return db
    .select()
    .from(passkeys)
    .where(eq(passkeys.memberId, memberId))
    .orderBy(asc(passkeys.createdAt))
}

export async function addPasskey(db: Conn, member: MemberRow, passkey: NewPasskey) {
  await db.insert(passkeys).values({ ...passkey, memberId: member.id })
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'passkey.added',
    detail: { name: passkey.name },
  })
}

export async function removePasskey(db: Db, member: MemberRow, id: string) {
  return db.transaction(async (tx) => {
    const [{ value: total }] = (await tx
      .select({ value: count() })
      .from(passkeys)
      .where(eq(passkeys.memberId, member.id))) as [{ value: number }]
    if (total <= 1)
      throw new AuthError('last_passkey', 'Add another passkey before removing this one')
    const deleted = await tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.memberId, member.id)))
      .returning()
    if (deleted.length === 0) throw new AuthError('not_found', 'Passkey not found')
    await audit(tx, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'passkey.removed',
    })
  })
}

// ---------- Sessions ----------

export async function createSession(
  db: Conn,
  memberId: string,
  opts: { viaRecovery?: boolean; now?: Date } = {},
) {
  const now = opts.now ?? new Date()
  const token = randomToken()
  await db.insert(sessions).values({
    id: sha256(token),
    memberId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    viaRecovery: opts.viaRecovery ?? false,
  })
  return token
}

/** Resolve a cookie token. Slides the expiry at most once a day. */
export async function getSession(db: Conn, token: string, now = new Date()) {
  const [row] = await db
    .select({ session: sessions, member: members, household: households })
    .from(sessions)
    .innerJoin(members, eq(members.id, sessions.memberId))
    .innerJoin(households, eq(households.id, members.householdId))
    .where(
      and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, now), isNull(members.removedAt)),
    )
  if (!row) return undefined
  if (now.getTime() - row.session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.session.id))
  }
  return row
}

export async function deleteSession(db: Conn, token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)))
}

export async function clearRecoveryFlag(db: Conn, token: string) {
  await db
    .update(sessions)
    .set({ viaRecovery: false })
    .where(eq(sessions.id, sha256(token)))
}

// ---------- Invites ----------

export async function createInvite(
  db: Conn,
  actor: MemberRow,
  role: 'adult' | 'viewer',
  now = new Date(),
) {
  assertOwner(actor)
  const token = randomToken(24)
  const [invite] = await db
    .insert(invites)
    .values({
      householdId: actor.householdId,
      tokenHash: sha256(token),
      role,
      createdBy: actor.id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .returning()
  await audit(db, {
    householdId: actor.householdId,
    memberId: actor.id,
    action: 'invite.created',
    detail: { role },
  })
  return { token, invite: invite! }
}

export async function findOpenInvite(db: Conn, token: string, now = new Date()) {
  const [row] = await db
    .select({ invite: invites, household: households })
    .from(invites)
    .innerJoin(households, eq(households.id, invites.householdId))
    .where(
      and(
        eq(invites.tokenHash, sha256(token)),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
      ),
    )
  return row
}

export async function listOpenInvites(db: Conn, householdId: string, now = new Date()) {
  return db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.householdId, householdId),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .orderBy(desc(invites.createdAt))
}

export async function revokeInvite(db: Conn, actor: MemberRow, inviteId: string) {
  assertOwner(actor)
  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(and(eq(invites.id, inviteId), eq(invites.householdId, actor.householdId)))
  await audit(db, { householdId: actor.householdId, memberId: actor.id, action: 'invite.revoked' })
}

/** Single use: the conditional update means two people can't redeem the same link. */
export async function acceptInvite(
  db: Db,
  input: { token: string; name: string; passkey: NewPasskey },
) {
  return db.transaction(async (tx) => {
    const open = await findOpenInvite(tx, input.token)
    if (!open) throw new AuthError('invite_invalid', 'This invite link is no longer valid')
    const [member] = await tx
      .insert(members)
      .values({ householdId: open.invite.householdId, name: input.name, role: open.invite.role })
      .returning()
    const claimed = await tx
      .update(invites)
      .set({ usedAt: new Date(), usedBy: member!.id })
      .where(and(eq(invites.id, open.invite.id), isNull(invites.usedAt)))
      .returning()
    if (claimed.length === 0)
      throw new AuthError('invite_invalid', 'This invite link is no longer valid')
    await tx.insert(passkeys).values({ ...input.passkey, memberId: member!.id })
    const codes = await replaceRecoveryCodes(tx, member!.id)
    await audit(tx, {
      householdId: member!.householdId,
      memberId: member!.id,
      action: 'member.joined',
      detail: { role: member!.role },
    })
    return { member: member!, recoveryCodes: codes }
  })
}

// ---------- Recovery codes ----------

async function replaceRecoveryCodes(tx: Conn, memberId: string): Promise<string[]> {
  await tx.delete(recoveryCodes).where(eq(recoveryCodes.memberId, memberId))
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode)
  await tx.insert(recoveryCodes).values(codes.map((c) => ({ memberId, codeHash: sha256(c) })))
  return codes
}

export async function regenerateRecoveryCodes(db: Db, member: MemberRow) {
  return db.transaction(async (tx) => {
    const codes = await replaceRecoveryCodes(tx, member.id)
    await audit(tx, {
      householdId: member.householdId,
      memberId: member.id,
      action: 'recovery.regenerated',
    })
    return codes
  })
}

export async function unusedRecoveryCodeCount(db: Conn, memberId: string) {
  const [{ value }] = (await db
    .select({ value: count() })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.memberId, memberId), isNull(recoveryCodes.usedAt)))) as [
    { value: number },
  ]
  return value
}

/** Burns the code and returns its member, or undefined. */
export async function redeemRecoveryCode(db: Conn, input: string) {
  const [row] = await db
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryCodes.codeHash, sha256(normalizeRecoveryCode(input))),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ memberId: recoveryCodes.memberId })
  if (!row) return undefined
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, row.memberId), isNull(members.removedAt)))
  return member
}

// ---------- Challenges ----------

export async function saveChallenge(
  db: Conn,
  input: {
    challenge: string
    purpose: (typeof authChallenges.$inferInsert)['purpose']
    payload?: Record<string, unknown>
  },
  now = new Date(),
) {
  const id = randomToken(24)
  await db.insert(authChallenges).values({
    id,
    challenge: input.challenge,
    purpose: input.purpose,
    payload: input.payload ?? {},
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
  })
  return id
}

/** One-time read: the row is deleted whether or not it was still valid. */
export async function takeChallenge(db: Conn, id: string, purpose: string, now = new Date()) {
  const [row] = await db.delete(authChallenges).where(eq(authChallenges.id, id)).returning()
  if (!row || row.purpose !== purpose || row.expiresAt <= now) return undefined
  return row
}

// ---------- Audit ----------

export async function audit(
  db: Conn,
  entry: {
    householdId?: string | null
    memberId?: string | null
    action: string
    detail?: Record<string, unknown>
    ip?: string | null
  },
) {
  await db.insert(auditLog).values({
    householdId: entry.householdId ?? null,
    memberId: entry.memberId ?? null,
    action: entry.action,
    detail: entry.detail ?? {},
    ip: entry.ip ?? null,
    ipHash: entry.ip ? blindIndex(entry.ip) : null,
  })
}

export async function countRecent(db: Conn, action: string, since: Date, ip?: string) {
  const conditions = [eq(auditLog.action, action), gt(auditLog.createdAt, since)]
  if (ip) conditions.push(eq(auditLog.ipHash, blindIndex(ip)))
  const [{ value }] = (await db
    .select({ value: count() })
    .from(auditLog)
    .where(and(...conditions))) as [{ value: number }]
  return value
}

export async function recentAudit(db: Conn, householdId: string, limit = 20) {
  return db
    .select({ entry: auditLog, memberName: members.name })
    .from(auditLog)
    .leftJoin(members, eq(members.id, auditLog.memberId))
    .where(eq(auditLog.householdId, householdId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
}
