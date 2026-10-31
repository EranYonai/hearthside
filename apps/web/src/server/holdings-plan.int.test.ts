import { randomBytes } from 'node:crypto'
import { classifyImport, readTable } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commitHoldingsPlan, planHoldingsImport } from './holdings-plan'
import { createInvestmentAccount, listHoldings, listInvestmentAccounts } from './invest'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `plan-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

async function home() {
  const { member: alex } = await createHousehold(db, {
    householdName: 'Our home',
    ownerName: 'Alex',
    passkey: passkey(),
  })
  const sam = (
    await acceptInvite(db, {
      token: (await createInvite(db, alex, 'adult')).token,
      name: 'Sam',
      passkey: passkey(),
    })
  ).member
  return { alex, sam }
}

// Synthetic files only.
const brokerFile = [
  'Interactive Brokers',
  'Account U7654321',
  '',
  'Symbol,Description,Quantity,Last Price,Currency',
  'TSTA,Test World Index ETF,10,100,USD',
  'TSTB,Test Bond Fund,4,50,USD',
].join('\n')

async function plan(member: Parameters<typeof planHoldingsImport>[1], text: string, accountId?: string) {
  const sheets = readTable(new TextEncoder().encode(text), 'positions.csv')
  const kind = classifyImport(sheets)
  if (kind.type !== 'holdings') throw new Error('expected holdings')
  return planHoldingsImport(db, member, sheets, kind.holdings, 'positions.csv', accountId)
}

afterAll(async () => {
  await client?.sql.end()
})

describe.skipIf(!url)('holdings import plan (Postgres)', () => {
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

  it('creates an account named after the broker, then finds it again', async () => {
    const { alex, sam } = await home()
    const first = await plan(alex, brokerFile)
    expect(first.account).toBeNull()
    expect(first.proposed).toEqual({
      name: 'Interactive Brokers ·4321',
      provider: 'Interactive Brokers',
      currency: 'USD',
    })
    const done = await commitHoldingsPlan(db, alex, first, {
      removeMissing: true,
      holderId: sam.id,
    })
    expect(done).toMatchObject({ added: 2, updated: 0, removed: 0 })
    expect(done.account.holderId).toBe(sam.id)

    const again = await plan(alex, brokerFile.replace('TSTB,Test Bond Fund,4,50,USD', ''))
    expect(again.account?.id).toBe(done.account.id)
    const second = await commitHoldingsPlan(db, alex, again, { removeMissing: true })
    expect(second).toMatchObject({ added: 0, updated: 1, removed: 1 })
    expect(await listHoldings(db, alex, [done.account.id])).toHaveLength(1)
    expect(await listInvestmentAccounts(db, alex)).toHaveLength(1)
  })

  it('uses an existing account at the same broker, and honours a chosen one', async () => {
    const { alex } = await home()
    const ib = await createInvestmentAccount(db, alex, {
      name: 'Our brokerage',
      provider: 'IBKR',
      currency: 'USD',
      visibility: 'household',
    })
    const other = await createInvestmentAccount(db, alex, {
      name: 'Pension',
      currency: 'ILS',
      visibility: 'household',
    })
    expect((await plan(alex, brokerFile)).account?.id).toBe(ib.id)
    expect((await plan(alex, brokerFile, other.id)).account?.id).toBe(other.id)
  })

  it('won’t import into someone else’s account', async () => {
    const { alex, sam } = await home()
    const mine = await createInvestmentAccount(db, sam, {
      name: 'Sam brokerage',
      provider: 'Interactive Brokers',
      currency: 'USD',
      visibility: 'household',
    })
    // Alex is the household owner and may manage it; a second adult may not.
    const robin = (
      await acceptInvite(db, {
        token: (await createInvite(db, alex, 'adult')).token,
        name: 'Robin',
        passkey: passkey(),
      })
    ).member
    expect((await plan(robin, brokerFile)).account).toBeNull()
    await expect(plan(robin, brokerFile, mine.id)).rejects.toBeInstanceOf(AuthError)
  })
})
