import { createDb, migrateDb, schema } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  AuthError,
  acceptInvite,
  addPasskey,
  changeRole,
  countRecent,
  createHousehold,
  createInvite,
  createSession,
  deleteSession,
  findOpenInvite,
  findPasskey,
  getHousehold,
  getSession,
  listMembers,
  listOpenInvites,
  listPasskeys,
  markPasskeyUsed,
  recentAudit,
  redeemRecoveryCode,
  regenerateRecoveryCodes,
  removeMember,
  removePasskey,
  revokeInvite,
  saveChallenge,
  takeChallenge,
  unusedRecoveryCodeCount,
  audit,
  clearRecoveryFlag,
  type NewPasskey,
} from './repo'
import { SESSION_REFRESH_MS } from './config'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (name = 'Mac'): NewPasskey => ({
  id: `cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: ['internal'],
  deviceType: 'multiDevice',
  backedUp: true,
  name,
})

async function setupHome() {
  return createHousehold(db, { householdName: 'Our home', ownerName: 'Alex', passkey: passkey() })
}

describe.skipIf(!url)('repo (Postgres)', () => {
  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
  })

  beforeEach(async () => {
    await db.execute(raw`truncate households, audit_log, auth_challenges cascade`)
  })

  afterAll(async () => {
    await client?.sql.end()
  })

  it('sets up exactly one household with an owner, passkey and ten recovery codes', async () => {
    expect(await getHousehold(db)).toBeUndefined()
    const { household, member, recoveryCodes } = await setupHome()
    expect(member).toMatchObject({ name: 'Alex', role: 'owner', householdId: household.id })
    expect(recoveryCodes).toHaveLength(10)
    expect(await unusedRecoveryCodeCount(db, member.id)).toBe(10)
    expect(await listPasskeys(db, member.id)).toHaveLength(1)
    await expect(setupHome()).rejects.toMatchObject({ code: 'household_exists' })
    expect(await countRecent(db, 'household.created', new Date(0))).toBe(1)
  })

  it('creates, slides and ends sessions', async () => {
    const { member } = await setupHome()
    const start = new Date()
    const token = await createSession(db, member.id, { now: start })
    const found = await getSession(db, token, start)
    expect(found?.member.id).toBe(member.id)
    expect(found?.household.name).toBe('Our home')
    const later = new Date(start.getTime() + SESSION_REFRESH_MS + 1000)
    await getSession(db, token, later)
    const [row] = await db.select().from(schema.sessions)
    expect(row!.expiresAt.getTime()).toBeGreaterThan(found!.session.expiresAt.getTime())
    expect(await getSession(db, 'wrong-token')).toBeUndefined()
    expect(
      await getSession(db, token, new Date(start.getTime() + 40 * 24 * 3600 * 1000)),
    ).toBeUndefined()
    await deleteSession(db, token)
    expect(await getSession(db, token)).toBeUndefined()
  })

  it('finds passkeys and tracks use', async () => {
    const { member } = await setupHome()
    const [key] = await listPasskeys(db, member.id)
    await markPasskeyUsed(db, key!.id, 5)
    const found = await findPasskey(db, key!.id)
    expect(found?.member.id).toBe(member.id)
    expect(found?.passkey.counter).toBe(5)
    expect(found?.passkey.lastUsedAt).toBeInstanceOf(Date)
    expect(await findPasskey(db, 'nope')).toBeUndefined()
  })

  it('never removes the last passkey', async () => {
    const { member } = await setupHome()
    const [first] = await listPasskeys(db, member.id)
    await expect(removePasskey(db, member, first!.id)).rejects.toMatchObject({
      code: 'last_passkey',
    })
    await addPasskey(db, member, passkey('iPhone'))
    await removePasskey(db, member, first!.id)
    expect((await listPasskeys(db, member.id)).map((k) => k.name)).toEqual(['iPhone'])
    await addPasskey(db, member, passkey('iPad'))
    await expect(removePasskey(db, member, 'nope')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('grows a household to three members through single-use invites', async () => {
    const { member: owner, household } = await setupHome()
    const adult = await createInvite(db, owner, 'adult')
    const viewer = await createInvite(db, owner, 'viewer')
    expect(await listOpenInvites(db, household.id)).toHaveLength(2)
    expect((await findOpenInvite(db, adult.token))?.household.name).toBe('Our home')

    const sam = await acceptInvite(db, { token: adult.token, name: 'Sam', passkey: passkey() })
    expect(sam.member.role).toBe('adult')
    expect(sam.recoveryCodes).toHaveLength(10)
    await expect(
      acceptInvite(db, { token: adult.token, name: 'Again', passkey: passkey() }),
    ).rejects.toMatchObject({
      code: 'invite_invalid',
    })
    const kid = await acceptInvite(db, { token: viewer.token, name: 'Kim', passkey: passkey() })
    expect(kid.member.role).toBe('viewer')

    expect((await listMembers(db, household.id)).map((m) => [m.name, m.role])).toEqual([
      ['Alex', 'owner'],
      ['Sam', 'adult'],
      ['Kim', 'viewer'],
    ])
    expect(await listOpenInvites(db, household.id)).toHaveLength(0)
  })

  it('lets only the owner invite, and honours revoke and expiry', async () => {
    const { member: owner } = await setupHome()
    const { token } = await createInvite(db, owner, 'adult')
    const sam = (await acceptInvite(db, { token, name: 'Sam', passkey: passkey() })).member
    await expect(createInvite(db, sam, 'adult')).rejects.toBeInstanceOf(AuthError)

    const revoked = await createInvite(db, owner, 'viewer')
    await revokeInvite(db, owner, revoked.invite.id)
    expect(await findOpenInvite(db, revoked.token)).toBeUndefined()

    const old = await createInvite(db, owner, 'viewer', new Date(Date.now() - 8 * 24 * 3600 * 1000))
    expect(await findOpenInvite(db, old.token)).toBeUndefined()
  })

  it('changes roles and removes members, revoking their access', async () => {
    const { member: owner, household } = await setupHome()
    const { token } = await createInvite(db, owner, 'adult')
    const sam = (await acceptInvite(db, { token, name: 'Sam', passkey: passkey() })).member
    const session = await createSession(db, sam.id)

    expect((await changeRole(db, owner, sam.id, 'viewer')).role).toBe('viewer')
    await expect(changeRole(db, owner, owner.id, 'adult')).rejects.toMatchObject({
      code: 'last_owner',
    })
    await expect(changeRole(db, owner, sam.id, 'owner')).rejects.toMatchObject({
      code: 'not_allowed',
    })
    await expect(changeRole(db, sam, owner.id, 'viewer')).rejects.toMatchObject({
      code: 'not_allowed',
    })
    await expect(changeRole(db, owner, crypto.randomUUID(), 'adult')).rejects.toMatchObject({
      code: 'not_found',
    })

    await expect(removeMember(db, owner, owner.id)).rejects.toMatchObject({ code: 'last_owner' })
    await removeMember(db, owner, sam.id)
    expect(await getSession(db, session)).toBeUndefined()
    expect(await listPasskeys(db, sam.id)).toHaveLength(0)
    expect((await listMembers(db, household.id)).map((m) => m.name)).toEqual(['Alex'])
    await expect(removeMember(db, owner, sam.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('redeems each recovery code once and can replace them', async () => {
    const { member, recoveryCodes } = await setupHome()
    const code = recoveryCodes[0]!
    expect((await redeemRecoveryCode(db, code.toLowerCase().replaceAll('-', ' ')))?.id).toBe(
      member.id,
    )
    expect(await redeemRecoveryCode(db, code)).toBeUndefined()
    expect(await redeemRecoveryCode(db, 'AAAA-BBBB-CCCC')).toBeUndefined()
    expect(await unusedRecoveryCodeCount(db, member.id)).toBe(9)

    const fresh = await regenerateRecoveryCodes(db, member)
    expect(await redeemRecoveryCode(db, recoveryCodes[1]!)).toBeUndefined()
    expect(await unusedRecoveryCodeCount(db, member.id)).toBe(10)
    expect(fresh).not.toContain(recoveryCodes[1])

    const token = await createSession(db, member.id, { viaRecovery: true })
    expect((await getSession(db, token))?.session.viaRecovery).toBe(true)
    await clearRecoveryFlag(db, token)
    expect((await getSession(db, token))?.session.viaRecovery).toBe(false)
  })

  it('uses challenges once, for their purpose, before they expire', async () => {
    const id = await saveChallenge(db, { challenge: 'c1', purpose: 'login' })
    expect(await takeChallenge(db, id, 'setup')).toBeUndefined()
    const again = await saveChallenge(db, { challenge: 'c2', purpose: 'login', payload: { a: 1 } })
    expect((await takeChallenge(db, again, 'login'))?.payload).toEqual({ a: 1 })
    expect(await takeChallenge(db, again, 'login')).toBeUndefined()
    const old = await saveChallenge(
      db,
      { challenge: 'c3', purpose: 'login' },
      new Date(Date.now() - 10 * 60 * 1000),
    )
    expect(await takeChallenge(db, old, 'login')).toBeUndefined()
  })

  it('keeps an audit trail and counts recent failures per ip', async () => {
    const { household, member } = await setupHome()
    await audit(db, { action: 'recovery.failed', ip: '1.1.1.1' })
    await audit(db, { action: 'recovery.failed', ip: '2.2.2.2' })
    expect(await countRecent(db, 'recovery.failed', new Date(Date.now() - 60000), '1.1.1.1')).toBe(
      1,
    )
    expect(await countRecent(db, 'recovery.failed', new Date(Date.now() - 60000))).toBe(2)
    await audit(db, { householdId: household.id, memberId: member.id, action: 'signin' })
    const entries = await recentAudit(db, household.id)
    expect(entries[0]).toMatchObject({ memberName: 'Alex' })
    expect(entries.map((e) => e.entry.action)).toContain('household.created')
  })
})
