import { randomBytes } from 'node:crypto'
import { parseStatement, type ParsedTransaction } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  accountSummaries,
  commitImport,
  commitPlan,
  planImport,
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
  updateAccount,
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
    await initEncryption(db, [randomBytes(32)])
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
    // Built-in keywords filed the rest at import.
    expect(await listTransactions(db, alex, { month: '2026-10', category: 'none' })).toHaveLength(0)
    const furniture = rows.find((r) => r.t.description === 'Furniture')!
    expect(furniture.t).toMatchObject({
      category: 'home',
      categorySource: 'auto',
      categoryVia: 'keyword',
    })

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

  it('detects accounts, creates them once and splits multi-card files', async () => {
    const { alex, robin } = await home()
    const rows = [
      ['תאריך עסקה', 'שם בית העסק', '4 ספרות אחרונות של כרטיס האשראי', 'סכום חיוב'],
      ['01/10/2026', 'Shop A', '1111', '10'],
      ['02/10/2026', 'Shop B', '2222', '20'],
      ['03/10/2026', 'Shop C', '1111', '30'],
    ]
    const parsed = parseStatement([{ name: 'S', rows }], { spendingIsPositive: true }).transactions
    const source = { provider: 'max' as const, kind: 'card' as const, network: null, last4: null }

    const plan = await planImport(db, alex, source, parsed)
    expect(plan.map((g) => [g.account, g.proposed.name, g.rows.length])).toEqual([
      [null, 'Max ·1111', 2],
      [null, 'Max ·2222', 1],
    ])
    const done = await commitPlan(db, alex, plan, { fileName: 'm.xlsx', fileHash: 'm', skipped: 2 })
    expect(
      done.map((d) => [d.account.name, d.account.last4, d.batch.added, d.batch.skipped]),
    ).toEqual([
      ['Max ·1111', '1111', 2, 2],
      ['Max ·2222', '2222', 1, 0],
    ])

    // The next file finds the same accounts and its rows are duplicates.
    const again = await planImport(db, alex, source, parsed)
    expect(again.map((g) => [g.account?.name, g.rows.every((r) => r.duplicate)])).toEqual([
      ['Max ·1111', true],
      ['Max ·2222', true],
    ])
    expect((await listAccounts(db, alex)).filter((a) => a.provider === 'max')).toHaveLength(2)

    // An explicit account takes every row.
    const target = done[1]!.account
    const forced = await planImport(db, alex, source, parsed, target.id)
    expect(forced).toHaveLength(1)
    expect(forced[0]!.account?.id).toBe(target.id)
    expect(forced[0]!.rows.map((r) => r.duplicate)).toEqual([false, true, false])

    await expect(planImport(db, robin, source, parsed)).rejects.toBeInstanceOf(AuthError)
    const empty = await planImport(db, alex, { ...source, last4: '9' }, [])
    expect(empty[0]!.proposed.name).toBe('Max ·9')
  })

  it('links accounts to the member who holds them', async () => {
    const { alex, sam, robin } = await home()
    // Alex imports Sam's card, privately.
    const card = await createAccount(db, alex, {
      name: 'Sam card',
      kind: 'card',
      visibility: 'private',
      holderId: sam.id,
    })
    expect(card.holderId).toBe(sam.id)
    expect((await getVisibleAccount(db, sam, card.id)).id).toBe(card.id)
    await expect(getVisibleAccount(db, robin, card.id)).rejects.toBeInstanceOf(AuthError)

    const rows = await prepareImport(db, card, october)
    await commitImport(db, alex, card, { fileName: 'o', fileHash: 'o', rows, skipped: 0 })
    expect(await listTransactions(db, alex, { month: '2026-10', holderId: sam.id })).toHaveLength(5)
    expect(await listTransactions(db, alex, { month: '2026-10', holderId: alex.id })).toHaveLength(
      0,
    )

    // Only the person who added it (or the owner) changes it; holders must be in the home.
    await expect(updateAccount(db, sam, card.id, { holderId: sam.id })).rejects.toBeInstanceOf(
      AuthError,
    )
    await expect(
      updateAccount(db, alex, card.id, { holderId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(AuthError)
    const back = await updateAccount(db, alex, card.id, { holderId: alex.id, name: 'Shared' })
    expect([back.holderId, back.name]).toEqual([null, 'Shared'])

    // Provider and color can be set and cleared; leaving them out keeps them.
    const styled = await updateAccount(db, alex, card.id, { provider: 'cal', color: '#5B2C83' })
    expect([styled.provider, styled.color]).toEqual(['cal', '#5B2C83'])
    const renamed = await updateAccount(db, alex, card.id, { name: 'Shared card' })
    expect([renamed.provider, renamed.color]).toEqual(['cal', '#5B2C83'])
    const cleared = await updateAccount(db, alex, card.id, { provider: null, color: null })
    expect([cleared.provider, cleared.color]).toEqual([null, null])
    await expect(getVisibleAccount(db, sam, card.id)).rejects.toBeInstanceOf(AuthError)

    // New accounts from an import can be given to someone else.
    const parsed = statement([['01/10/2026', 'Shop', '10', '']])
    const source = { provider: 'cal' as const, kind: 'card' as const, network: null, last4: '7' }
    const plan = await planImport(db, alex, source, parsed)
    const [done] = await commitPlan(db, alex, plan, {
      fileName: 'c',
      fileHash: 'c',
      skipped: 0,
      holderId: sam.id,
    })
    expect(done!.account.holderId).toBe(sam.id)
  })

  it('keeps card and bank views apart and counts card bills once', async () => {
    const { alex } = await home()
    const card = await createAccount(db, alex, {
      name: 'Card',
      kind: 'card',
      visibility: 'household',
    })
    const bank = await createAccount(db, alex, {
      name: 'Bank',
      kind: 'bank',
      visibility: 'household',
    })
    await commitImport(db, alex, card, {
      fileName: 'c',
      fileHash: 'c',
      rows: await prepareImport(db, card, statement([['05/10/2026', 'Grocer', '300', '']])),
      skipped: 0,
    })
    const bankRows = parseStatement(
      [
        {
          name: 'B',
          rows: [
            ['תאריך', 'תיאור', 'חובה', 'זכות'],
            ['10/10/2026', 'ISRACARD', '300', ''],
            ['11/10/2026', 'Rent', '1000', ''],
            ['12/10/2026', 'Salary', '', '5000'],
          ],
        },
      ],
      { spendingIsPositive: false },
    ).transactions
    await commitImport(db, alex, bank, {
      fileName: 'b',
      fileHash: 'b',
      rows: await prepareImport(db, bank, bankRows),
      skipped: 0,
    })

    expect(await totals(db, alex, { month: '2026-10', kind: 'card' })).toMatchObject({
      spent: -30000,
      cardBills: 0,
    })
    expect(await totals(db, alex, { month: '2026-10', kind: 'bank' })).toMatchObject({
      spent: -130000,
      received: 500000,
      cardBills: 0,
    })
    // Together, the card bill from the bank is left out.
    expect(await totals(db, alex, { month: '2026-10' })).toMatchObject({
      spent: -130000,
      received: 500000,
      cardBills: -30000,
      count: 4,
    })
    expect(await listTransactions(db, alex, { month: '2026-10', kind: 'bank' })).toHaveLength(3)

    const summary = await accountSummaries(db, alex, '2026-10')
    expect(summary.map((s) => [s.account.name, s.out, s.in, s.count])).toEqual([
      ['Card', -30000, 0, 1],
      ['Bank', -130000, 500000, 3],
    ])
    const empty = await accountSummaries(db, alex, '2026-01')
    expect(empty.map((s) => s.count)).toEqual([0, 0])
  })

  it('validates months', () => {
    expect(monthRange('2026-12')).toEqual(['2026-12-01', '2027-01-01'])
    expect(monthRange('2026-02')).toEqual(['2026-02-01', '2026-03-01'])
    expect(() => monthRange('2026-13')).toThrow(AuthError)
    expect(() => monthRange('x')).toThrow(AuthError)
  })
})
