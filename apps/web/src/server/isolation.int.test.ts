import { randomBytes } from 'node:crypto'
import { parseStatement } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listBudgets, setBudget } from './budgets'
import { createCategory, listCustomCategories } from './categories'
import {
  createInvestmentAccount,
  getVisibleInvestmentAccount,
  listInvestmentAccounts,
} from './invest'
import {
  commitImport,
  createAccount,
  getVisibleAccount,
  listAccounts,
  listBatches,
  listMonths,
  listTransactions,
  prepareImport,
} from './ledger'
import {
  createLoan,
  createProperty,
  getLoan,
  getProperty,
  listLoans,
  listProperties,
} from './loans'
import { listRecurring } from './recurring'
import {
  changeRole,
  createHousehold,
  createInvite,
  listMembers,
  listOpenInvites,
  removeMember,
  revokeInvite,
  type NewPasskey,
} from './repo'

// Two homes on one server must never see or change each other's data.

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `iso-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'multiDevice',
  backedUp: true,
  name: 'Phone',
})

const rows = parseStatement(
  [
    {
      name: 'S',
      rows: [
        ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב'],
        ['28/10/2026', 'Super Market', '412.30'],
        ['27/09/2026', 'Super Market', '398.10'],
      ],
    },
  ],
  { spendingIsPositive: true },
).transactions

async function fullHome(name: string) {
  const { member, household } = await createHousehold(db, {
    householdName: name,
    ownerName: `${name} owner`,
    passkey: passkey(),
  })
  const card = await createAccount(db, member, {
    name: 'Card',
    kind: 'card',
    visibility: 'household',
  })
  await commitImport(db, member, card, {
    fileName: 'oct.xlsx',
    fileHash: `${name}-h`,
    rows: await prepareImport(db, card, rows),
    skipped: 0,
  })
  const invest = await createInvestmentAccount(db, member, {
    name: 'Savings',
    currency: 'ILS',
    visibility: 'household',
  })
  const property = await createProperty(db, member, {
    name: 'Flat',
    currency: 'ILS',
    value: '1,000,000',
    visibility: 'household',
  })
  const loan = await createLoan(db, member, {
    name: 'Mortgage',
    kind: 'mortgage',
    currency: 'ILS',
    principal: '500,000',
    rate: '4',
    termMonths: 240,
    startOn: '2020-01-15',
    visibility: 'household',
  })
  const { slug } = await createCategory(db, member, {
    label: 'Pets',
    icon: 'pets',
    direction: 'out',
    keywords: [],
  })
  await setBudget(db, member, 'groceries', '1000')
  await createInvite(db, member, 'adult')
  const [invite] = await listOpenInvites(db, member.householdId)
  return { household, member, card, invest, property, loan, slug, invite: invite! }
}

describe.skipIf(!url)('two homes on one server (Postgres)', () => {
  let a: Awaited<ReturnType<typeof fullHome>>
  let b: Awaited<ReturnType<typeof fullHome>>

  beforeAll(async () => {
    await db.execute(
      raw`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
    )
    await migrateDb(db, join(import.meta.dirname, '../../../../packages/db/migrations'))
    await initEncryption(db, [randomBytes(32)])
    a = await fullHome('Alpha')
    b = await fullHome('Beta')
  })

  afterAll(async () => {
    await client?.sql.end()
  })

  it('lists only the home’s own data', async () => {
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const m = me.member
      expect((await listAccounts(db, m)).map((x) => x.id)).toEqual([me.card.id])
      expect((await listInvestmentAccounts(db, m)).map((x) => x.id)).toEqual([me.invest.id])
      expect((await listProperties(db, m)).map((x) => x.id)).toEqual([me.property.id])
      expect((await listLoans(db, m)).map((x) => x.id)).toEqual([me.loan.id])
      expect((await listMembers(db, m.householdId)).map((x) => x.id)).toEqual([m.id])
      expect((await listOpenInvites(db, m.householdId)).map((x) => x.id)).toEqual([me.invite.id])
      expect((await listCustomCategories(db, m.householdId)).map((c) => c.slug)).toEqual([me.slug])
      expect((await listBudgets(db, m)).length).toBe(1)
      expect((await listBatches(db, m)).every((x) => x.batch.accountId === me.card.id)).toBe(true)
      const tx = await listTransactions(db, m, { month: '2026-10' })
      expect(tx.length).toBe(1)
      expect(tx.every((r) => r.t.accountId === me.card.id)).toBe(true)
      expect(await listMonths(db, m)).toHaveLength(2)
      await listRecurring(db, m)
      expect(other.member.householdId).not.toBe(m.householdId)
    }
  })

  it('refuses to open or change the other home’s things by id', async () => {
    const m = a.member
    await expect(getVisibleAccount(db, m, b.card.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getVisibleInvestmentAccount(db, m, b.invest.id)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(getProperty(db, m, b.property.id)).rejects.toThrow()
    await expect(getLoan(db, m, b.loan.id)).rejects.toThrow()
    await expect(
      listTransactions(db, m, { month: '2026-10', accountId: b.card.id }),
    ).resolves.toEqual([])
    await expect(changeRole(db, m, b.member.id, 'viewer')).rejects.toThrow()
    await expect(removeMember(db, m, b.member.id)).rejects.toThrow()
    await revokeInvite(db, m, b.invite.id)
    expect((await listOpenInvites(db, b.member.householdId)).map((x) => x.id)).toEqual([
      b.invite.id,
    ])
    expect((await listMembers(db, b.member.householdId)).map((x) => x.role)).toEqual(['owner'])
  })
})
