import { parseStatement } from '@hearthside/core'
import { createDb, migrateDb, schema } from '@hearthside/db'
import { eq, sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanCategoryInput,
  createCategory,
  deleteCategory,
  householdCategorySet,
  listCustomCategories,
  updateCategory,
} from './categories'
import { categorizePending, loadContext } from './categorize'
import { commitImport, createAccount, listTransactions, prepareImport, setCategory } from './ledger'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `categories-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

// Synthetic entries.
const header = ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף']
const rows = parseStatement(
  [
    {
      name: 'S',
      rows: [
        header,
        ['28/10/2026', 'Sunny Vet Clinic', '90', ''],
        ['27/10/2026', 'Zorblax 42', '15', ''],
      ],
    },
  ],
  { spendingIsPositive: true },
).transactions

const pets = {
  label: 'Pets',
  icon: 'pets',
  direction: 'out',
  keywords: ['Vet Clinic', ' pet food '],
} as const

describe.skipIf(!url)('household categories (Postgres)', () => {
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

  async function home() {
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
    return { alex, robin }
  }

  it('adds, renames and lists a household category', async () => {
    const { alex } = await home()
    const { slug } = await createCategory(db, alex, pets)
    expect(slug).toMatch(/^c-[a-z0-9]+$/)
    expect(await listCustomCategories(db, alex.householdId)).toEqual([
      { slug, label: 'Pets', icon: 'pets', direction: 'out', keywords: ['vet clinic', 'pet food'] },
    ])
    await updateCategory(db, alex, slug, { ...pets, label: 'Our pets', icon: 'gifts' })
    const set = await householdCategorySet(db, alex.householdId)
    expect(set.label(slug)).toBe('Our pets')
    expect(set.icon(slug)).toBe('gifts')
  })

  it('refuses clashing names, bad input and viewers', async () => {
    const { alex, robin } = await home()
    await createCategory(db, alex, pets)
    await expect(createCategory(db, alex, { ...pets, label: 'PETS' })).rejects.toThrow(/already/)
    await expect(createCategory(db, alex, { ...pets, label: 'groceries' })).rejects.toThrow(
      /already/,
    )
    await expect(
      createCategory(db, robin, { ...pets, label: 'Other pets' }),
    ).rejects.toBeInstanceOf(AuthError)
    await expect(updateCategory(db, alex, 'c-missing', pets)).rejects.toThrow(/isn’t here/)
    expect(() => cleanCategoryInput({ ...pets, label: '  ' })).toThrow(/name/)
    expect(() => cleanCategoryInput({ ...pets, label: 'x'.repeat(31) })).toThrow(/30/)
    expect(() => cleanCategoryInput({ ...pets, icon: 'nope' as 'pets' })).toThrow(/icon/)
    expect(() => cleanCategoryInput({ ...pets, direction: 'up' as 'in' })).toThrow(/money/)
    expect(() => cleanCategoryInput({ ...pets, keywords: ['x'] })).toThrow(/2 to 40/)
    expect(() =>
      cleanCategoryInput({ ...pets, keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) }),
    ).toThrow(/20/)
  })

  it('files entries with its keywords and lets people pick it', async () => {
    const { alex } = await home()
    const { slug } = await createCategory(db, alex, pets)
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
    const list = await listTransactions(db, alex, { month: '2026-10' })
    const vet = list.find((r) => r.t.description === 'Sunny Vet Clinic')!
    expect(vet.t).toMatchObject({ category: slug, categoryVia: 'keyword' })
    const other = list.find((r) => r.t.description === 'Zorblax 42')!
    await setCategory(db, alex, other.t.id, slug, true)
    expect((await loadContext(db, alex.householdId)).rules?.get('zorblax 42')).toBe(slug)
    expect(await listTransactions(db, alex, { month: '2026-10', category: slug })).toHaveLength(2)
    await expect(setCategory(db, alex, other.t.id, 'c-missing')).rejects.toBeInstanceOf(AuthError)
  })

  it('on removal, clears its entries and rules so they get filed again', async () => {
    const { alex } = await home()
    const { slug } = await createCategory(db, alex, pets)
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
    const zorblax = (await listTransactions(db, alex, { month: '2026-10' })).find(
      (r) => r.t.description === 'Zorblax 42',
    )!
    await setCategory(db, alex, zorblax.t.id, slug, true)
    expect(await deleteCategory(db, alex, slug)).toEqual({ cleared: 2 })
    const after = await listTransactions(db, alex, { month: '2026-10' })
    expect(after.every((r) => r.t.category === null && r.t.categoryCheckedAt === null)).toBe(true)
    const rules = await db
      .select()
      .from(schema.categoryRules)
      .where(eq(schema.categoryRules.householdId, alex.householdId))
    expect(rules).toHaveLength(0)
    // The vet goes back to the built-in keywords: "clinic" is health.
    await categorizePending(db, alex.householdId, null)
    const vet = (await listTransactions(db, alex, { month: '2026-10' })).find(
      (r) => r.t.description === 'Sunny Vet Clinic',
    )!
    expect(vet.t.category).toBe('health')
  })
})
