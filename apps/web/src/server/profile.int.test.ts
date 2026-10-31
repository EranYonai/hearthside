import { createDb, migrateDb, schema } from '@hearthside/db'
import { eq, sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setOnboarded, updateProfile } from './profile'
import { acceptInvite, createHousehold, createInvite, getHousehold } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = () => ({
  id: `profile-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: ['internal'],
  deviceType: 'multiDevice',
  backedUp: true,
  name: 'Phone',
})

async function home() {
  const { member: owner } = await createHousehold(db, {
    householdName: 'Our home',
    ownerName: 'Alex',
    passkey: passkey(),
  })
  const { token } = await createInvite(db, owner, 'adult')
  const { member: adult } = await acceptInvite(db, { token, name: 'Sam', passkey: passkey() })
  return { owner, adult }
}

const memberRow = async (id: string) =>
  (await db.select().from(schema.members).where(eq(schema.members.id, id)))[0]!

describe.skipIf(!url)('profile (Postgres)', () => {
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

  it('starts new members in shekels and not yet onboarded', async () => {
    const { owner, adult } = await home()
    for (const m of [owner, adult])
      expect(m).toMatchObject({ displayCurrency: 'ILS', onboardedAt: null })
  })

  it('saves a name and display currency, and lets only the owner rename the home', async () => {
    const { owner, adult } = await home()
    const saved = await updateProfile(db, adult, { name: '  Sam  B ', displayCurrency: 'EUR' })
    expect(saved).toMatchObject({ name: 'Sam B', displayCurrency: 'EUR' })

    await expect(
      updateProfile(db, adult, { name: 'Sam', displayCurrency: 'EUR', householdName: 'Mine' }),
    ).rejects.toMatchObject({ code: 'not_allowed' })

    await updateProfile(db, owner, { name: 'Alex', displayCurrency: 'USD', householdName: 'Nest' })
    expect((await getHousehold(db))?.name).toBe('Nest')
    expect((await memberRow(owner.id)).displayCurrency).toBe('USD')
  })

  it('rejects empty names and unknown currencies', async () => {
    const { owner } = await home()
    await expect(updateProfile(db, owner, { name: ' ', displayCurrency: 'ILS' })).rejects.toThrow(
      /name/,
    )
    await expect(
      updateProfile(db, owner, { name: 'Alex', displayCurrency: 'XXX' }),
    ).rejects.toThrow(/currency/)
    await expect(
      updateProfile(db, owner, { name: 'Alex', displayCurrency: 'ILS', householdName: '' }),
    ).rejects.toThrow(/home/)
  })

  it('marks the welcome steps done and can show them again', async () => {
    const { adult } = await home()
    const at = new Date('2026-10-30T12:00:00Z')
    await setOnboarded(db, adult, true, at)
    expect((await memberRow(adult.id)).onboardedAt).toEqual(at)
    await setOnboarded(db, adult, false)
    expect((await memberRow(adult.id)).onboardedAt).toBeNull()
  })
})
