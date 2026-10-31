import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getInvestSettings, runCheckup, saveInvestSettings } from './checkup'
import { createInvestmentAccount, saveFundFacts, saveHolding } from './invest'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'
import { addMovement } from './trends'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `checkup-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

describe.skipIf(!url)('check-up (Postgres)', () => {
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

  it('keeps sealed household settings that owners and adults change', async () => {
    const { member: alex, household } = await createHousehold(db, {
      householdName: 'Our home',
      ownerName: 'Alex',
      passkey: passkey(),
    })
    const robin = (
      await acceptInvite(db, {
        token: (await createInvite(db, alex, 'viewer')).token,
        name: 'Robin',
        passkey: passkey(),
      })
    ).member
    expect(await getInvestSettings(db, household.id)).toEqual({
      stocksTarget: 80,
      emergencyMonths: 6,
      checkupOn: true,
    })
    await saveInvestSettings(db, alex, {
      stocksTarget: '60',
      emergencyMonths: '3',
      checkupOn: true,
    })
    expect((await getInvestSettings(db, household.id)).stocksTarget).toBe(60)
    const [row] = (await db.execute(raw`select invest_settings from households`)) as unknown as {
      invest_settings: string
    }[]
    expect(row!.invest_settings).toMatch(/^hs1:/)
    expect(row!.invest_settings).not.toContain('stocksTarget')
    await expect(
      saveInvestSettings(db, robin, { stocksTarget: 50, emergencyMonths: 3 }),
    ).rejects.toThrow(AuthError)
    await expect(
      saveInvestSettings(db, alex, { stocksTarget: 150, emergencyMonths: 3 }),
    ).rejects.toThrow(AuthError)
  })

  it('checks the split, fees and deposits, or stays quiet when off', async () => {
    const { member: alex } = await createHousehold(db, {
      householdName: 'Our home',
      ownerName: 'Alex',
      passkey: passkey(),
    })
    const me = { ...alex, displayCurrency: 'USD' }
    const account = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    const fund = await saveHolding(db, alex, account.id, {
      kind: 'security',
      symbol: 'TSTW',
      name: 'Test World',
      currency: 'USD',
      assetClass: 'global_stocks',
      units: '95',
      price: '1',
    })
    await saveHolding(db, alex, account.id, { kind: 'cash', currency: 'USD', units: '5' })
    await saveFundFacts(db, alex, fund.id, { fee: '0.9' })
    const now = new Date('2026-10-31T12:00:00Z')
    await addMovement(
      db,
      alex,
      account.id,
      { kind: 'deposit', on: '2026-10-01', amount: '100' },
      now,
    )

    const { items } = await runCheckup(db, me, new Map(), now)
    const by = Object.fromEntries(items.map((i) => [i.key, i]))
    expect(by.split!.status).toBe('nudge') // 95/5 against 80/20
    expect(by.fees!.detail).toContain('Test World (0.9%)')
    expect(by.deposits!.status).toBe('ok')
    expect(by.emergency!.status).toBe('info') // no statements yet

    await saveInvestSettings(db, alex, { stocksTarget: 95, emergencyMonths: 0, checkupOn: false })
    expect((await runCheckup(db, me, new Map(), now)).items).toEqual([])
  })
})
