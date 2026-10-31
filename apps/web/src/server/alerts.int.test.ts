import { randomBytes } from 'node:crypto'
import { parseStatement, type DecisionEngine } from '@hearthside/core'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { alertPending, sweepPending } from './categorize'
import {
  commitImport,
  createAccount,
  dismissAlert,
  listTransactions,
  prepareImport,
} from './ledger'
import { AuthError, acceptInvite, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `alerts-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

// Synthetic entries: a fee, a spike against three usual bills, and two plain ones.
const header = ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף']
const rows = parseStatement(
  [
    {
      name: 'S',
      rows: [
        header,
        ['01/10/2026', 'Grid Power', '100', ''],
        ['02/10/2026', 'Grid Power', '110', ''],
        ['03/10/2026', 'Grid Power', '105', ''],
        ['04/10/2026', 'Grid Power', '900', ''],
        ['05/10/2026', 'Card annual fee', '25', ''],
        ['06/10/2026', 'Zorblax 42', '40', ''],
        ['07/10/2026', 'Quindle Ltd', '30', ''],
      ],
    },
  ],
  { spendingIsPositive: true },
).transactions

function fakeEngine(yes: Record<string, number>) {
  const engine = {
    name: 'fake',
    asked: 0,
    async decide(requests: readonly { state: unknown }[]) {
      engine.asked += requests.length
      return requests.map((r) => {
        const p = yes[(r.state as { description: string }).description] ?? 0.1
        return { alert: { type: 'yesno', yes: p, confidence: Math.max(p, 1 - p) } }
      })
    },
  }
  return engine as typeof engine & DecisionEngine
}

describe.skipIf(!url)('alerts (Postgres)', () => {
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
    const byName = async () =>
      new Map(
        (await listTransactions(db, alex, { month: '2026-10' })).map((r) => [
          `${r.t.description} ${r.t.amountMinor}`,
          r.t,
        ]),
      )
    return { alex, byName }
  }

  it('flags fees, spikes and what the model finds unusual, once', async () => {
    const { alex, byName } = await imported()
    const engine = fakeEngine({ 'Zorblax 42': 0.9 })
    expect(await alertPending(db, alex.householdId, engine)).toEqual({
      looked: 7,
      flagged: 3,
      waiting: false,
    })
    const t = await byName()
    expect(t.get('Card annual fee -2500')).toMatchObject({ alert: 'fee' })
    expect(t.get('Grid Power -90000')).toMatchObject({ alert: 'spike' })
    expect(t.get('Grid Power -10000')!.alert).toBeNull()
    expect(t.get('Zorblax 42 -4000')).toMatchObject({ alert: 'model' })
    expect(t.get('Quindle Ltd -3000')!.alert).toBeNull()
    expect(t.get('Quindle Ltd -3000')!.alertCheckedAt).not.toBeNull()
    // Asked about Zorblax and Quindle only (fees and spikes don't need the model).
    expect(engine.asked).toBe(3)
    expect(await alertPending(db, alex.householdId, engine)).toMatchObject({ looked: 0 })
    expect(await listTransactions(db, alex, { month: '2026-10', category: 'alerts' })).toHaveLength(
      3,
    )
  })

  it('keeps cheap alerts without the model, and lets the model look later', async () => {
    const { alex, byName } = await imported()
    expect((await alertPending(db, alex.householdId, null)).flagged).toBe(2)
    expect((await byName()).get('Zorblax 42 -4000')!.alertCheckedAt).toBeNull()
    expect(
      (await alertPending(db, alex.householdId, fakeEngine({ 'Zorblax 42': 0.95 }))).flagged,
    ).toBe(3)
  })

  it('lets people dismiss an alert for good', async () => {
    const { alex, byName } = await imported()
    await alertPending(db, alex.householdId, fakeEngine({}))
    const fee = (await byName()).get('Card annual fee -2500')!
    const invite = await createInvite(db, alex, 'viewer')
    const { member: robin } = await acceptInvite(db, {
      token: invite.token,
      name: 'Robin',
      passkey: passkey(),
    })
    await expect(dismissAlert(db, robin, fee.id)).rejects.toBeInstanceOf(AuthError)
    await expect(
      dismissAlert(db, alex, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(AuthError)
    await dismissAlert(db, alex, fee.id)
    expect(await listTransactions(db, alex, { month: '2026-10', category: 'alerts' })).toHaveLength(
      1,
    )
    // A re-check leaves it dismissed.
    await db.execute(raw`update transactions set alert_checked_at = null`)
    await alertPending(db, alex.householdId, fakeEngine({}))
    expect((await byName()).get('Card annual fee -2500')!.alertDismissedAt).not.toBeNull()
    await sweepPending(db)
  })
})
