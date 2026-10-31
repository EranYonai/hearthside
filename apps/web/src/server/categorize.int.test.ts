import { categorySet, parseStatement, type DecisionEngine } from '@hearthside/core'
import { createDb, migrateDb, schema } from '@hearthside/db'
import { eq, sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categorizePending,
  loadContext,
  recategorize,
  resetCategorizer,
  scheduleCategorize,
  sweepPending,
} from './categorize'
import { commitImport, createAccount, listTransactions, prepareImport, setCategory } from './ledger'
import { createHousehold, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `categorize-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

// Synthetic merchants: two the keywords know, two only a model could place.
const header = ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף']
const rows = parseStatement(
  [
    {
      name: 'S',
      rows: [
        header,
        ['28/10/2026', 'Green Leaf Supermarket', '412.30', ''],
        ['27/10/2026', 'Zorblax 42', '99', ''],
        ['26/10/2026', 'Zorblax 42', '15', ''],
        ['25/10/2026', 'Quindle Ltd', '30', ''],
      ],
    },
  ],
  { spendingIsPositive: true },
).transactions

const set = categorySet()

/** Answers from a table; counts the questions it was asked. */
function fakeEngine(table: Record<string, [string, number]>) {
  const engine = {
    name: 'fake',
    asked: 0,
    async decide(requests: readonly { state: unknown; questions: object }[]) {
      engine.asked += requests.length
      return requests.map((r) => {
        const [slug, p] = table[(r.state as { description: string }).description] ?? ['other', 0.2]
        // The model answers with category names.
        const choice = set.has(slug) ? set.label(slug) : slug
        return {
          category: { type: 'choice', choice, confidence: p, probabilities: { [choice]: p } },
        }
      })
    },
  }
  return engine as typeof engine & DecisionEngine
}

describe.skipIf(!url)('categorize (Postgres)', () => {
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

  async function imported() {
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
    const list = async () =>
      new Map(
        (await listTransactions(db, alex, { month: '2026-10' })).map((r) => [
          `${r.t.description} ${r.t.amountMinor}`,
          r.t,
        ]),
      )
    return { alex, list }
  }

  it('files keywords at import and the rest with the model, asking once per description', async () => {
    const { alex, list } = await imported()
    expect((await list()).get('Green Leaf Supermarket -41230')).toMatchObject({
      category: 'groceries',
      categorySource: 'auto',
      categoryVia: 'keyword',
    })
    const engine = fakeEngine({ 'Zorblax 42': ['shopping', 0.8] })
    expect(await categorizePending(db, alex.householdId, engine)).toEqual({
      looked: 3,
      filed: 2,
      waiting: false,
    })
    expect(engine.asked).toBe(2)
    const after = await list()
    expect(after.get('Zorblax 42 -9900')).toMatchObject({
      category: 'shopping',
      categoryVia: 'model',
      categoryConfidence: expect.closeTo(0.8, 5),
    })
    // Unsure: left uncategorized, and not asked again.
    expect(after.get('Quindle Ltd -3000')!.category).toBeNull()
    expect(after.get('Quindle Ltd -3000')!.categoryCheckedAt).not.toBeNull()
    expect(await categorizePending(db, alex.householdId, engine)).toMatchObject({ looked: 0 })
  })

  it('leaves entries waiting while the model is down or missing', async () => {
    const { alex, list } = await imported()
    const down: DecisionEngine = {
      name: 'down',
      decide: async () => {
        const { DecisionUnavailable } = await import('@hearthside/core')
        throw new DecisionUnavailable('down')
      },
    }
    expect((await categorizePending(db, alex.householdId, down)).waiting).toBe(true)
    expect(await categorizePending(db, alex.householdId, null)).toMatchObject({ filed: 0 })
    expect((await list()).get('Quindle Ltd -3000')!.categoryCheckedAt).toBeNull()
    // Picked up later, e.g. by the startup sweep.
    const engine = fakeEngine({ 'Quindle Ltd': ['bills', 0.9] })
    expect((await categorizePending(db, alex.householdId, engine)).filed).toBe(1)
  })

  it('never overwrites people’s choices, and learns from them', async () => {
    const { alex, list } = await imported()
    const before = await list()
    await setCategory(db, alex, before.get('Zorblax 42 -9900')!.id, 'kids')
    await setCategory(db, alex, before.get('Quindle Ltd -3000')!.id, null)
    const engine = fakeEngine({ 'Zorblax 42': ['shopping', 0.99], 'Quindle Ltd': ['bills', 0.99] })
    await categorizePending(db, alex.householdId, engine)
    const after = await list()
    expect(after.get('Zorblax 42 -9900')).toMatchObject({
      category: 'kids',
      categorySource: 'manual',
    })
    // The other Zorblax follows the past pick, without the model.
    expect(after.get('Zorblax 42 -1500')).toMatchObject({
      category: 'kids',
      categoryVia: 'history',
    })
    // Cleared by hand stays cleared, even after a re-run.
    await recategorize(db, alex.householdId, 'uncategorized', engine)
    expect((await list()).get('Quindle Ltd -3000')!.category).toBeNull()
    expect((await loadContext(db, alex.householdId)).history?.get('zorblax 42')?.category).toBe(
      'kids',
    )
  })

  it('re-runs on request, optionally redoing its own choices', async () => {
    const { alex, list } = await imported()
    await categorizePending(db, alex.householdId, fakeEngine({}))
    const better = fakeEngine({ 'Quindle Ltd': ['subscriptions', 0.9] })
    await recategorize(db, alex.householdId, 'uncategorized', better)
    expect((await list()).get('Quindle Ltd -3000')!.category).toBe('subscriptions')

    await recategorize(db, alex.householdId, 'auto', fakeEngine({ 'Quindle Ltd': ['bills', 0.9] }))
    const after = await list()
    expect(after.get('Quindle Ltd -3000')!.category).toBe('bills')
    // Keywords run again too.
    expect(after.get('Green Leaf Supermarket -41230')!.category).toBe('groceries')
  })

  it('runs one background job per household and sweeps at startup', async () => {
    const { alex, list } = await imported()
    process.env.DECIDE_URL = ''
    const a = scheduleCategorize(db, alex.householdId)
    expect(scheduleCategorize(db, alex.householdId)).toBe(a)
    expect(await a).toMatchObject({ waiting: false })
    await resetCategorizer(db, alex.householdId, 'uncategorized')
    await sweepPending(db)
    expect((await list()).get('Zorblax 42 -9900')!.category).toBeNull()
    const [row] = await db
      .select({ n: raw<number>`count(*)::int` })
      .from(schema.transactions)
      .where(eq(schema.transactions.householdId, alex.householdId))
    expect(row!.n).toBe(4)
  })
})
