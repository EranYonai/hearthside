import { randomBytes } from 'node:crypto'
import { parseStatement } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addBudgets,
  budgetOverview,
  listBudgets,
  monthsBefore,
  parseLimit,
  setBudget,
} from './budgets'
import { createCategory, deleteCategory } from './categories'
import { commitImport, createAccount, listTransactions, prepareImport, setCategory } from './ledger'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

const passkey = (): NewPasskey => ({
  id: `budget-cred-${randomBytes(4).toString('hex')}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

// Synthetic entries over four months.
const rows = parseStatement(
  [
    {
      name: 'S',
      rows: [
        ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף'],
        ['05/07/2026', 'Green Basket', '900', ''],
        ['05/08/2026', 'Green Basket', '1100', ''],
        ['09/08/2026', 'Noodle Bar', '120', ''],
        ['05/09/2026', 'Green Basket', '1000', ''],
        ['05/10/2026', 'Green Basket', '850', ''],
        ['07/10/2026', 'Noodle Bar', '260', ''],
        ['08/10/2026', 'Corner Lamp Shop', '300', ''],
      ],
    },
  ],
  { spendingIsPositive: true },
).transactions

const CATEGORY: Record<string, string> = {
  'Green Basket': 'groceries',
  'Noodle Bar': 'eating-out',
}

describe('monthsBefore', () => {
  it('counts back across a new year', () => {
    expect(monthsBefore('2026-02', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('parseLimit', () => {
  it('reads amounts and treats empty or zero as no budget', () => {
    expect(parseLimit('1,500')).toBe(150_000)
    expect(parseLimit('99.5')).toBe(9_950)
    expect(parseLimit('')).toBeNull()
    expect(parseLimit('0')).toBeNull()
    expect(() => parseLimit('lots')).toThrow(AuthError)
    expect(() => parseLimit('-5')).toThrow(AuthError)
  })
})

describe.skipIf(!url)('budgets (Postgres)', () => {
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

  async function household() {
    const { member: alex } = await createHousehold(db, {
      householdName: 'Our home',
      ownerName: 'Alex',
      passkey: passkey(),
    })
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
    for (const month of ['2026-07', '2026-08', '2026-09', '2026-10'])
      for (const { t } of await listTransactions(db, alex, { month }))
        await setCategory(db, alex, t.id, CATEGORY[t.description] ?? 'shopping')
    return alex
  }

  it('sets limits, shows progress and suggests from the months before', async () => {
    const alex = await household()
    const now = new Date('2026-10-20T12:00:00Z')
    let view = await budgetOverview(db, alex, '2026-10', now)
    expect(view.limits).toEqual([])
    expect(view.month.outsideMinor).toBe(141_000)
    // July to September: groceries 1000 a month, eating out 40, shopping none.
    expect(view.suggestions).toEqual([
      { category: 'groceries', limitMinor: 100_000 },
      { category: 'eating-out', limitMinor: 4_000 },
    ])

    expect(await addBudgets(db, alex, view.suggestions)).toBe(2)
    await setBudget(db, alex, 'eating-out', '200')
    view = await budgetOverview(db, alex, '2026-10', now)
    expect(view.suggestions).toEqual([])
    expect(view.month.lines).toMatchObject([
      { category: 'eating-out', limitMinor: 20_000, spentMinor: 26_000, status: 'over' },
      { category: 'groceries', limitMinor: 100_000, spentMinor: 85_000, status: 'near' },
    ])
    expect(view.month).toMatchObject({
      limitMinor: 120_000,
      spentMinor: 111_000,
      outsideMinor: 30_000,
    })

    // Suggestions never overwrite a limit someone set.
    expect(await addBudgets(db, alex, [{ category: 'eating-out', limitMinor: 1 }])).toBe(0)
    // Clearing takes the budget away.
    await setBudget(db, alex, 'eating-out', '')
    expect((await listBudgets(db, alex)).map((b) => b.category)).toEqual(['groceries'])
  })

  it('keeps limits encrypted at rest', async () => {
    const alex = await household()
    await setBudget(db, alex, 'groceries', '1234')
    const [row] = (await db.execute(raw`select limit_minor from budgets`)) as unknown as {
      limit_minor: string
    }[]
    expect(row!.limit_minor).not.toContain('123400')
  })

  it('refuses viewers and categories that can’t have a budget', async () => {
    const alex = await household()
    const invite = await createInvite(db, alex, 'viewer')
    const { member: robin } = await acceptInvite(db, {
      token: invite.token,
      name: 'Robin',
      passkey: passkey(),
    })
    await expect(setBudget(db, robin, 'groceries', '100')).rejects.toThrow(/Viewers/)
    await expect(addBudgets(db, robin, [{ category: 'groceries', limitMinor: 1 }])).rejects.toThrow(
      /Viewers/,
    )
    await expect(setBudget(db, alex, 'income', '100')).rejects.toThrow(/can’t have a budget/)
    await expect(setBudget(db, alex, 'nope', '100')).rejects.toThrow(/can’t have a budget/)
    await expect(setBudget(db, alex, 'groceries', 'x')).rejects.toThrow(/Enter an amount/)
  })

  it('drops a household category’s budget with the category', async () => {
    const alex = await household()
    const { slug } = await createCategory(db, alex, {
      label: 'Pets',
      icon: 'pets',
      direction: 'out',
      keywords: [],
    })
    const { slug: side } = await createCategory(db, alex, {
      label: 'Side gigs',
      icon: 'work',
      direction: 'in',
      keywords: [],
    })
    await setBudget(db, alex, slug, '300')
    await expect(setBudget(db, alex, side, '300')).rejects.toThrow(/can’t have a budget/)
    expect(await listBudgets(db, alex)).toEqual([{ category: slug, limitMinor: 30_000 }])
    await deleteCategory(db, alex, slug)
    expect(await listBudgets(db, alex)).toEqual([])
  })
})
