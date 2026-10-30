import { parseStatement, type ParsedTransaction } from '@hearthside/core'
import { createDb, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  commitImport,
  createAccount,
  findBatchByHash,
  getOwnAccount,
  getVisibleAccount,
  listAccounts,
  listBatches,
  listMonths,
  listTransactions,
  monthRange,
  prepareImport,
  setCategory,
  totals,
  undoBatch,
} from './ledger'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `ledger-cred-${++n}`,
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
  const adultInvite = await createInvite(db, alex, 'adult')
  const { member: sam } = await acceptInvite(db, {
    token: adultInvite.token,
    name: 'Sam',
    passkey: passkey(),
  })
  const viewerInvite = await createInvite(db, alex, 'viewer')
  const { member: robin } = await acceptInvite(db, {
    token: viewerInvite.token,
    name: 'Robin',
    passkey: passkey(),
  })
  return { alex, sam, robin }
}

const header = ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף']
function statement(rows: string[][]): ParsedTransaction[] {
  return parseStatement([{ name: 'S', rows: [header, ...rows] }], { spendingIsPositive: true })
    .transactions
}

const october = statement([
  ['28/10/2026', 'Super Market', '412.30', ''],
  ['27/10/2026', 'Coffee', '18', ''],
  ['27/10/2026', 'Coffee', '18', ''],
  ['12/10/2026', 'Furniture', '500', 'תשלום 2 מתוך 6'],
  ['26/10/2026', 'Salary refund', '-200', ''],
])

describe.skipIf(!url)('ledger (Postgres)', () => {
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

  it('imports a statement once and skips duplicates in overlapping files', async () => {
    const { alex } = await home()
    const card = await createAccount(db, alex, {
      name: 'Alex card',
      kind: 'card',
      visibility: 'household',
    })

    const prepared = await prepareImport(db, card, october)
    expect(prepared.every((r) => !r.duplicate)).toBe(true)
    const batch = await commitImport(db, alex, card, {
      fileName: 'oct.xlsx',
      fileHash: 'h1',
      rows: prepared,
      skipped: 1,
    })
    expect(batch).toMatchObject({ added: 5, duplicates: 0, skipped: 1 })
    expect((await findBatchByHash(db, card.id, 'h1'))?.id).toBe(batch.id)

    // The next export repeats two October rows and adds one new.
    const overlap = statement([
      ['27/10/2026', 'Coffee', '18', ''],
      ['28/10/2026', 'Super Market', '412.30', ''],
      ['02/11/2026', 'Pharmacy', '45.90', ''],
    ])
    const again = await prepareImport(db, card, overlap)
    expect(again.map((r) => r.duplicate)).toEqual([true, true, false])
    const second = await commitImport(db, alex, card, {
      fileName: 'nov.xlsx',
      fileHash: 'h2',
      rows: again,
      skipped: 0,
    })
    expect(second).toMatchObject({ added: 1, duplicates: 2 })

    const rows = await listTransactions(db, alex, { month: '2026-10' })
    expect(rows.map((r) => r.t.description)).toEqual([
      'Super Market',
      'Coffee',
      'Coffee',
      'Salary refund',
      'Furniture',
    ])
    expect(rows.find((r) => r.t.description === 'Furniture')?.t).toMatchObject({
      installmentN: 2,
      installmentTotal: 6,
      amountMinor: -50000,
    })
    expect(await listMonths(db, alex)).toEqual(['2026-11', '2026-10'])
    expect(await totals(db, alex, { month: '2026-10' })).toMatchObject({
      spent: -41230 - 1800 - 1800 - 50000,
      received: 20000,
      count: 5,
    })
  })

  it('files transactions by category and remembers the choice', async () => {
    const { alex, robin } = await home()
    const card = await createAccount(db, alex, {
      name: 'Card',
      kind: 'card',
      visibility: 'household',
    })
    await commitImport(db, alex, card, {
      fileName: 'a.csv',
      fileHash: 'a',
      rows: await prepareImport(db, card, october),
      skipped: 0,
    })
    const rows = await listTransactions(db, alex, { month: '2026-10' })
    const coffee = rows.filter((r) => r.t.description === 'Coffee')
    const market = rows.find((r) => r.t.description === 'Super Market')!

    await setCategory(db, alex, market.t.id, 'groceries')
    expect((await setCategory(db, alex, coffee[0]!.t.id, 'eating-out', true)).also).toBe(1)

    // A hand-picked category is not overwritten by a rule.
    await setCategory(db, alex, coffee[1]!.t.id, 'other')
    await setCategory(db, alex, coffee[0]!.t.id, 'eating-out', true)
    const after = await listTransactions(db, alex, { month: '2026-10', category: 'eating-out' })
    expect(after).toHaveLength(1)
    expect(await listTransactions(db, alex, { month: '2026-10', category: 'none' })).toHaveLength(2)

    // Future imports use the rule.
    const next = statement([['03/11/2026', 'COFFEE ', '18', '']])
    await commitImport(db, alex, card, {
      fileName: 'b.csv',
      fileHash: 'b',
      rows: await prepareImport(db, card, next),
      skipped: 0,
    })
    const nov = await listTransactions(db, alex, { month: '2026-11' })
    expect(nov[0]!.t).toMatchObject({ category: 'eating-out', categorySource: 'rule' })

    expect(await listTransactions(db, alex, { month: '2026-10', search: 'super' })).toHaveLength(1)
    expect(await listTransactions(db, alex, { month: '2026-10', search: '100%' })).toHaveLength(0)

    await expect(setCategory(db, robin, market.t.id, 'home')).rejects.toBeInstanceOf(AuthError)
    await expect(setCategory(db, alex, market.t.id, 'nope' as 'home')).rejects.toBeInstanceOf(
      AuthError,
    )
    await setCategory(db, alex, market.t.id, null)
    const cleared = await listTransactions(db, alex, { month: '2026-10', search: 'super' })
    expect(cleared[0]!.t.category).toBeNull()
  })

  it('keeps private accounts private and limits who imports and undoes', async () => {
    const { alex, sam, robin } = await home()
    const shared = await createAccount(db, sam, {
      name: 'Sam card',
      kind: 'card',
      visibility: 'household',
    })
    const secret = await createAccount(db, sam, {
      name: 'Sam own',
      kind: 'bank',
      visibility: 'private',
    })
    await expect(
      createAccount(db, robin, { name: 'x', kind: 'other', visibility: 'household' }),
    ).rejects.toBeInstanceOf(AuthError)

    expect((await listAccounts(db, sam)).map((a) => a.name)).toEqual(['Sam card', 'Sam own'])
    expect((await listAccounts(db, alex)).map((a) => a.name)).toEqual(['Sam card'])
    expect((await listAccounts(db, robin)).map((a) => a.name)).toEqual(['Sam card'])
    await expect(getVisibleAccount(db, alex, secret.id)).rejects.toBeInstanceOf(AuthError)
    await expect(getOwnAccount(db, alex, shared.id)).rejects.toBeInstanceOf(AuthError)
    expect((await getOwnAccount(db, sam, shared.id)).id).toBe(shared.id)

    const own = await commitImport(db, sam, secret, {
      fileName: 'p.csv',
      fileHash: 'p',
      rows: await prepareImport(db, secret, october.slice(0, 2)),
      skipped: 0,
    })
    const visible = await commitImport(db, sam, shared, {
      fileName: 's.csv',
      fileHash: 's',
      rows: await prepareImport(db, shared, october.slice(2)),
      skipped: 0,
    })
    await expect(
      commitImport(db, alex, shared, { fileName: 'x', fileHash: 'x', rows: [], skipped: 0 }),
    ).rejects.toBeInstanceOf(AuthError)

    expect(await listTransactions(db, sam, { month: '2026-10' })).toHaveLength(5)
    expect(await listTransactions(db, alex, { month: '2026-10' })).toHaveLength(3)
    expect(
      await listTransactions(db, alex, { month: '2026-10', accountId: secret.id }),
    ).toHaveLength(0)
    expect((await listBatches(db, alex)).map((b) => b.batch.id)).toEqual([visible.id])

    await expect(undoBatch(db, robin, visible.id)).rejects.toBeInstanceOf(AuthError)
    await expect(undoBatch(db, alex, own.id)).rejects.toBeInstanceOf(AuthError)
    // The household owner can undo a shared import; it removes its transactions.
    await undoBatch(db, alex, visible.id)
    expect(await listTransactions(db, sam, { month: '2026-10' })).toHaveLength(2)
    await undoBatch(db, sam, own.id)
    expect(await listTransactions(db, sam, { month: '2026-10' })).toHaveLength(0)
  })

  it('validates months', () => {
    expect(monthRange('2026-12')).toEqual(['2026-12-01', '2027-01-01'])
    expect(monthRange('2026-02')).toEqual(['2026-02-01', '2026-03-01'])
    expect(() => monthRange('2026-13')).toThrow(AuthError)
    expect(() => monthRange('x')).toThrow(AuthError)
  })
})
