import { randomBytes } from 'node:crypto'
import { parseStatement } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commitImport, createAccount, prepareImport } from './ledger'
import { listRecurring, recurringAndDismissed, setDismissed } from './recurring'
import { createHousehold, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

const passkey = (): NewPasskey => ({
  id: `recurring-cred-${randomBytes(4).toString('hex')}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

// Synthetic entries: a steady monthly plan with a new price, and a one-off.
const rows = parseStatement(
  [
    {
      name: 'S',
      rows: [
        ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף'],
        ['04/07/2026', 'Streamly Plus', '50', ''],
        ['04/08/2026', 'Streamly Plus', '50', ''],
        ['04/09/2026', 'Streamly Plus', '50', ''],
        ['04/10/2026', 'Streamly Plus', '59', ''],
        ['12/10/2026', 'Corner Lamp Shop', '240', ''],
      ],
    },
  ],
  { spendingIsPositive: true },
).transactions

describe.skipIf(!url)('recurring (Postgres)', () => {
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

  it('finds repeating payments in what the member can see', async () => {
    const { member: alex } = await createHousehold(db, {
      householdName: 'Our home',
      ownerName: 'Alex',
      passkey: passkey(),
    })
    expect(await listRecurring(db, alex)).toEqual([])
    const card = await createAccount(db, alex, {
      name: 'Card',
      kind: 'card',
      visibility: 'household',
    })
    await commitImport(db, alex, card, {
      fileName: 'a.csv',
      fileHash: 'a',
      rows: await prepareImport(db, card, rows),
      skipped: 0,
    })
    const found = await listRecurring(db, alex, new Date('2026-11-01T12:00:00Z'))
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      description: 'Streamly Plus',
      cadence: 'monthly',
      typicalMinor: -5000,
      lastMinor: -5900,
      changedPercent: 18,
      count: 4,
    })
    // Someone says it isn't a fixed cost; it moves to the dismissed list and can come back.
    const at = new Date('2026-11-01T12:00:00Z')
    await setDismissed(db, alex, found[0]!.key)
    await setDismissed(db, alex, found[0]!.key)
    let both = await recurringAndDismissed(db, alex, at)
    expect(both.recurring).toEqual([])
    expect(both.dismissed.map((r) => r.description)).toEqual(['Streamly Plus'])
    await setDismissed(db, alex, found[0]!.key, true)
    both = await recurringAndDismissed(db, alex, at)
    expect(both.recurring).toHaveLength(1)
    expect(both.dismissed).toEqual([])
    await expect(setDismissed(db, alex, '')).rejects.toThrow('Unknown payment')

    // Long after it stopped, it's no longer a fixed cost.
    expect(await listRecurring(db, alex, new Date('2027-06-01T12:00:00Z'))).toEqual([])
  })
})
