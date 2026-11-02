import { randomBytes } from 'node:crypto'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recipientFromSecret } from '../lib/backup-key'
import { BACKUP_DOWNLOADED, getBackupKey, lastBackupDownload, setBackupKey } from './backups'
import { acceptInvite, audit, AuthError, createHousehold, createInvite } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = () => ({
  id: `backup-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice' as const,
  backedUp: false,
  name: 'Phone',
})

describe.skipIf(!url)('backups (Postgres)', () => {
  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
    await initEncryption(db, [randomBytes(32)])
  })

  afterAll(async () => {
    await client?.sql.end()
  })

  it('lets only the owner link a passkey key, and remembers downloads', async () => {
    const { member: alex, household } = await createHousehold(db, {
      householdName: 'Our home',
      ownerName: 'Alex',
      passkey: passkey(),
    })
    const invite = await createInvite(db, alex, 'adult')
    const { member: sam } = await acceptInvite(db, {
      token: invite.token,
      name: 'Sam',
      passkey: passkey(),
    })
    const key = {
      recipient: await recipientFromSecret(new Uint8Array(32).fill(1)),
      credentialId: 'Y3JlZGVudGlhbC1pZC0x',
    }

    await expect(setBackupKey(db, sam, key)).rejects.toBeInstanceOf(AuthError)
    await expect(
      setBackupKey(db, alex, { ...key, recipient: 'AGE-SECRET-KEY-1NOPE' }),
    ).rejects.toBeInstanceOf(AuthError)
    expect(await getBackupKey(db, household.id)).toBeUndefined()

    await setBackupKey(db, alex, key)
    expect(await getBackupKey(db, household.id)).toEqual(key)
    await setBackupKey(db, alex, null)
    expect(await getBackupKey(db, household.id)).toBeUndefined()

    expect(await lastBackupDownload(db, household.id)).toBeUndefined()
    await audit(db, { householdId: household.id, memberId: alex.id, action: BACKUP_DOWNLOADED })
    expect(await lastBackupDownload(db, household.id)).toBeInstanceOf(Date)
  })
})
