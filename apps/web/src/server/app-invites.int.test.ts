import { randomBytes } from 'node:crypto'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  REQUESTS_PER_IP_PER_HOUR,
  RateLimited,
  appInviteSummary,
  cleanEmail,
  countHomes,
  createAppInvite,
  createHomeFromInvite,
  findOpenAppInvite,
  listInviteRequests,
  markRequestHandled,
  requestInvite,
  revokeAppInvite,
} from './app-invites'
import {
  acceptInvite,
  createHousehold,
  createInvite,
  findOpenInvite,
  listMembers,
  type NewPasskey,
} from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `app-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'multiDevice',
  backedUp: true,
  name: 'Phone',
})

async function firstHome() {
  return createHousehold(
    db,
    { householdName: 'Our home', ownerName: 'Alex', passkey: passkey() },
    { firstRunOnly: true },
  )
}

describe.skipIf(!url)('friend invites (Postgres)', () => {
  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
    await initEncryption(db, [randomBytes(32)])
  })

  beforeEach(async () => {
    await db.execute(raw`truncate households, audit_log, auth_challenges, invite_requests cascade`)
  })

  afterAll(async () => {
    await client?.sql.end()
  })

  it('makes the first-run owner the server admin, and nobody else', async () => {
    const { member: alex } = await firstHome()
    expect(alex.serverAdmin).toBe(true)
    const { token } = await createAppInvite(db, alex)
    const friend = await createHomeFromInvite(db, token, {
      householdName: 'Sam’s place',
      ownerName: 'Sam',
      passkey: passkey(),
    })
    expect(friend.member).toMatchObject({ role: 'owner', serverAdmin: false })
    expect(await countHomes(db, alex)).toBe(2)
    await expect(countHomes(db, friend.member)).rejects.toMatchObject({ code: 'not_allowed' })
  })

  it('creates a separate home, once, and never a seat in the inviter’s home', async () => {
    const { member: alex, household } = await firstHome()
    const { token } = await createAppInvite(db, alex)
    expect((await findOpenAppInvite(db, token))?.inviterName).toBe('Alex')
    // A friend invite is not a home invite.
    expect(await findOpenInvite(db, token)).toBeUndefined()
    await expect(
      acceptInvite(db, { token, name: 'Sneaky', passkey: passkey() }),
    ).rejects.toMatchObject({ code: 'invite_invalid' })

    const friend = await createHomeFromInvite(db, token, {
      householdName: 'Sam’s place',
      ownerName: 'Sam',
      passkey: passkey(),
    })
    expect(friend.household.id).not.toBe(household.id)
    expect(friend.recoveryCodes).toHaveLength(10)
    expect((await listMembers(db, household.id)).map((m) => m.name)).toEqual(['Alex'])
    await expect(
      createHomeFromInvite(db, token, {
        householdName: 'Again',
        ownerName: 'X',
        passkey: passkey(),
      }),
    ).rejects.toMatchObject({ code: 'invite_invalid' })
    expect(await appInviteSummary(db, alex)).toMatchObject({ open: [], joined: 1 })
  })

  it('lets any approved member send one, and the sender revoke it', async () => {
    const { member: alex } = await firstHome()
    const homeInvite = await createInvite(db, alex, 'viewer')
    const { member: robin } = await acceptInvite(db, {
      token: homeInvite.token,
      name: 'Robin',
      passkey: passkey(),
    })
    // Waiting for the owner's approval: not yet.
    await expect(createAppInvite(db, robin)).rejects.toMatchObject({ code: 'not_allowed' })
    const approved = { ...robin, approvedAt: new Date() }
    const { token, invite } = await createAppInvite(db, approved)
    expect((await appInviteSummary(db, approved)).open.map((i) => i.id)).toEqual([invite.id])
    // Someone else's revoke does nothing.
    await revokeAppInvite(db, alex, invite.id)
    expect(await findOpenAppInvite(db, token)).toBeDefined()
    await revokeAppInvite(db, approved, invite.id)
    expect(await findOpenAppInvite(db, token)).toBeUndefined()
  })

  it('expires after 7 days', async () => {
    const { member: alex } = await firstHome()
    const { token } = await createAppInvite(db, alex, new Date('2026-01-01'))
    expect(await findOpenAppInvite(db, token, new Date('2026-01-07'))).toBeDefined()
    expect(await findOpenAppInvite(db, token, new Date('2026-01-09'))).toBeUndefined()
  })

  it('keeps invite requests encrypted, one per address, rate limited, for the admin only', async () => {
    const { member: alex } = await firstHome()
    expect(cleanEmail(' friend@example.com ')).toBe('friend@example.com')
    expect(cleanEmail('nope')).toBeUndefined()
    await requestInvite(db, 'friend@example.com', '10.0.0.1')
    await requestInvite(db, 'Friend@Example.com', '10.0.0.2')
    const rows = (await db.execute(raw`select email from invite_requests`)) as unknown as {
      email: string
    }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).not.toContain('example')
    const [req] = await listInviteRequests(db, alex)
    expect(req!.email).toBe('friend@example.com')

    for (let i = 0; i < REQUESTS_PER_IP_PER_HOUR - 1; i++)
      await requestInvite(db, `f${i}@example.com`, '10.0.0.1')
    await expect(requestInvite(db, 'late@example.com', '10.0.0.1')).rejects.toBeInstanceOf(
      RateLimited,
    )

    const { token } = await createAppInvite(db, alex)
    const friend = await createHomeFromInvite(db, token, {
      householdName: 'Other',
      ownerName: 'Sam',
      passkey: passkey(),
    })
    await expect(listInviteRequests(db, friend.member)).rejects.toMatchObject({
      code: 'not_allowed',
    })
    await markRequestHandled(db, alex, req!.id)
    expect((await listInviteRequests(db, alex)).map((r) => r.id)).not.toContain(req!.id)
  })
})
