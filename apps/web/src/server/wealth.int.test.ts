import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { parseStatement } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createInvestmentAccount, saveHolding } from './invest'
import {
  commitImport,
  createAccount,
  getVisibleAccount,
  prepareImport,
  updateAccount,
} from './ledger'
import { acceptInvite, createHousehold, createInvite, type NewPasskey } from './repo'
import { wealth } from './wealth'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `wealth-cred-${++n}`,
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
  const { member: sam } = await acceptInvite(db, {
    token: (await createInvite(db, alex, 'adult')).token,
    name: 'Sam',
    passkey: passkey(),
  })
  return { alex, sam }
}

const header = ['תאריך', 'תיאור', 'חובה', 'זכות', 'יתרה']
const bankRows = (rows: string[][]) =>
  parseStatement([{ name: 'S', rows: [header, ...rows] }], { spendingIsPositive: false })
    .transactions

const today = new Date('2026-10-31T12:00:00Z')
const rates = new Map([['USD/ILS', 4]])

describe.skipIf(!url)('wealth (Postgres)', () => {
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

  it('keeps a bank account’s balance from its statements, newest wins', async () => {
    const { alex } = await home()
    const bank = await createAccount(db, alex, {
      name: 'Main',
      kind: 'bank',
      visibility: 'household',
    })
    const october = bankRows([
      ['20/10/2026', 'Rent', '5,000.00', '', '10,000.00'],
      ['05/10/2026', 'Salary', '', '15,000.00', '15,000.00'],
    ])
    await commitImport(db, alex, bank, {
      fileName: 'oct.pdf',
      fileHash: 'b1',
      rows: await prepareImport(db, bank, october),
      skipped: 0,
    })
    let stored = await getVisibleAccount(db, alex, bank.id)
    expect(stored).toMatchObject({
      balanceMinor: 1_000_000,
      balanceOn: '2026-10-20',
      balanceSource: 'statement',
    })

    // An older file afterwards leaves the newer balance alone.
    const september = bankRows([['10/09/2026', 'Old', '1.00', '', '99.00']])
    await commitImport(db, alex, bank, {
      fileName: 'sep.pdf',
      fileHash: 'b2',
      rows: await prepareImport(db, bank, september),
      skipped: 0,
    })
    stored = await getVisibleAccount(db, alex, bank.id)
    expect(stored.balanceMinor).toBe(1_000_000)

    // The balance is sealed at rest.
    const [row] = (await db.execute(
      raw`select balance_minor from accounts where id = ${bank.id}`,
    )) as unknown as { balance_minor: string }[]
    expect(row!.balance_minor).not.toContain('1000000')

    // Typed in, today.
    await updateAccount(db, alex, bank.id, { balanceMinor: 1_234_500 }, today)
    stored = await getVisibleAccount(db, alex, bank.id)
    expect(stored).toMatchObject({
      balanceMinor: 1_234_500,
      balanceOn: '2026-10-31',
      balanceSource: 'manual',
    })
  })

  it('adds bank balances and investments, and works history back', async () => {
    const { alex, sam } = await home()
    const bank = await createAccount(db, alex, {
      name: 'Main',
      kind: 'bank',
      visibility: 'household',
    })
    await createAccount(db, alex, { name: 'Empty', kind: 'bank', visibility: 'household' })
    await createAccount(db, alex, { name: 'Card', kind: 'card', visibility: 'household' })
    await createAccount(db, sam, { name: 'Sam secret', kind: 'bank', visibility: 'private' })
    const rows = bankRows([
      ['01/10/2026', 'Salary', '', '15,000.00', '15,000.00'],
      ['20/10/2026', 'Rent', '5,000.00', '', '10,000.00'],
    ])
    await commitImport(db, alex, bank, {
      fileName: 'oct.pdf',
      fileHash: 'b1',
      rows: await prepareImport(db, bank, rows),
      skipped: 0,
    })
    const invest = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    await saveHolding(db, alex, invest.id, { kind: 'cash', currency: 'USD', units: '1000' })

    const w = await wealth(db, alex, rates, today)
    expect(w.currency).toBe('ILS')
    expect(w.cashMinor).toBe(1_000_000)
    expect(w.investedMinor).toBe(400_000)
    expect(w.totalMinor).toBe(1_400_000)
    expect(w.parts.map((p) => [p.name, p.kind, p.minor])).toEqual([
      ['Main', 'cash', 1_000_000],
      ['Long term', 'invest', 400_000],
    ])
    expect(w.missing.map((m) => m.name)).toEqual(['Empty'])
    expect(w.series).toHaveLength(27)
    expect(w.series.at(-1)).toEqual({
      on: '2026-10-31',
      totalMinor: 1_400_000,
      investedMinor: 400_000,
    })
    // Before the salary landed the account held nothing; the rent came after it.
    const early = w.series.find((p) => p.on < '2026-10-01')!
    expect(early.totalMinor - early.investedMinor).toBe(0)
    const mid = w.series.find((p) => p.on >= '2026-10-01' && p.on < '2026-10-20')!
    expect(mid.totalMinor - mid.investedMinor).toBe(1_500_000)

    // Sam's private account is Sam's alone.
    expect(w.missing.some((m) => m.name === 'Sam secret')).toBe(false)
    expect((await wealth(db, sam, rates, today)).missing.map((m) => m.name)).toEqual([
      'Empty',
      'Sam secret',
    ])
  })

  it('has nothing to show without balances or investments', async () => {
    const { alex } = await home()
    const w = await wealth(db, alex, rates, today)
    expect(w).toMatchObject({ any: false, totalMinor: 0, series: [], parts: [] })
  })
})
