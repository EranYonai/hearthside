import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { listBrandLogos, removeBrandLogo, setBrandLogo } from './logos'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `logos-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

// A synthetic image: just the PNG signature and a few bytes.
const png = (tail: number) =>
  `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tail]).toString('base64')}`

describe.skipIf(!url)('brand logos (Postgres)', () => {
  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
    await initEncryption(db, [randomBytes(32)])
  })
  beforeEach(async () => {
    await db.execute(raw`truncate households, audit_log, auth_challenges cascade`)
  })
  afterAll(async () => {
    await client?.sql.end()
  })

  it('stores logos per household, sealed, and lets editors replace or remove them', async () => {
    const { member: alex } = await createHousehold(db, {
      householdName: 'Our home',
      ownerName: 'Alex',
      passkey: passkey(),
    })
    const invite = await createInvite(db, alex, 'viewer')
    const { member: robin } = await acceptInvite(db, {
      token: invite.token,
      name: 'Robin',
      passkey: passkey(),
    })

    expect(await listBrandLogos(db, alex.householdId)).toEqual({})
    await setBrandLogo(db, alex, 'leumi', png(1))
    await setBrandLogo(db, alex, 'ibkr', png(2))
    await setBrandLogo(db, alex, 'leumi', png(3))
    expect(await listBrandLogos(db, alex.householdId)).toEqual({ leumi: png(3), ibkr: png(2) })

    // Stored sealed: neither the image nor the brand name shows in the table.
    const dump = JSON.stringify(await db.execute(raw`select * from brand_logos`))
    expect(dump).not.toContain('iVBOR')
    expect(dump).not.toContain('leumi')

    await expect(setBrandLogo(db, robin, 'leumi', png(4))).rejects.toBeInstanceOf(AuthError)
    await expect(setBrandLogo(db, alex, 'nope', png(4))).rejects.toBeInstanceOf(AuthError)
    await expect(
      setBrandLogo(db, alex, 'cal', 'data:image/svg+xml;base64,PHN2Zy8+'),
    ).rejects.toBeInstanceOf(AuthError)
    await expect(removeBrandLogo(db, robin, 'leumi')).rejects.toBeInstanceOf(AuthError)

    await removeBrandLogo(db, alex, 'leumi')
    expect(await listBrandLogos(db, alex.householdId)).toEqual({ ibkr: png(2) })
  })
})
