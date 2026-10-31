import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createDb, initEncryption, migrateDb, schema } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createInvestmentAccount, saveHolding } from './invest'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'
import {
  addMovement,
  listMovements,
  recordAllSnapshots,
  recordSnapshots,
  removeMovement,
  trends,
} from './trends'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `trends-cred-${++n}`,
  publicKey: 'pk',
  counter: 0,
  transports: [],
  deviceType: 'singleDevice',
  backedUp: false,
  name: 'Phone',
})

async function home() {
  const { member: alex, household } = await createHousehold(db, {
    householdName: 'Our home',
    ownerName: 'Alex',
    passkey: passkey(),
  })
  const join = async (role: 'adult' | 'viewer', name: string) =>
    (
      await acceptInvite(db, {
        token: (await createInvite(db, alex, role)).token,
        name,
        passkey: passkey(),
      })
    ).member
  return { household, alex, sam: await join('adult', 'Sam'), robin: await join('viewer', 'Robin') }
}

const day = (on: string) => new Date(`${on}T12:00:00Z`)
const rates = new Map([['USD/ILS', 4]])

describe.skipIf(!url)('trends (Postgres)', () => {
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

  it('records a sealed value per account per day, rewriting today', async () => {
    const { household, alex, sam } = await home()
    const usd = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    // Private to Sam, still recorded: snapshots are household bookkeeping.
    await createInvestmentAccount(db, sam, { name: 'Mine', currency: 'ILS', visibility: 'private' })
    await saveHolding(db, alex, usd.id, { kind: 'cash', currency: 'USD', units: '100' })
    await saveHolding(db, alex, usd.id, { kind: 'cash', currency: 'ILS', units: '40' })

    expect(await recordSnapshots(db, household.id, rates, day('2026-01-01'))).toBe(2)
    await saveHolding(db, alex, usd.id, { kind: 'cash', currency: 'USD', units: '150' })
    await recordSnapshots(db, household.id, rates, day('2026-01-01'))

    const rows = await db.select().from(schema.portfolioSnapshots)
    expect(rows).toHaveLength(2)
    // 150 USD + 40 ILS at 4 ILS per USD = 160 USD.
    expect(rows.find((r) => r.accountId === usd.id)).toMatchObject({
      valueMinor: 16000,
      currency: 'USD',
    })
    const [stored] = (await db.execute(
      raw`select value_minor from portfolio_snapshots where account_id = ${usd.id}`,
    )) as unknown as { value_minor: string }[]
    expect(stored!.value_minor).not.toBe('16000')
  })

  it('records every household from the hourly job', async () => {
    const { alex } = await home()
    await createInvestmentAccount(db, alex, { name: 'A', currency: 'ILS', visibility: 'household' })
    await recordAllSnapshots(db, day('2026-02-01'))
    expect(await db.select().from(schema.portfolioSnapshots)).toHaveLength(1)
  })

  it('adds and removes money in and out, for whoever manages the account', async () => {
    const { alex, sam, robin } = await home()
    const account = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    const now = day('2026-03-01')
    const dep = await addMovement(
      db,
      alex,
      account.id,
      { kind: 'deposit', on: '2026-02-01', amount: '1,000' },
      now,
    )
    await addMovement(db, alex, account.id, { kind: 'fee', on: '2026-02-15', amount: '2.5' }, now)
    expect(dep).toMatchObject({ amountMinor: 100000, currency: 'USD', source: 'manual' })

    expect((await listMovements(db, sam)).map((m) => [m.kind, m.amountMinor])).toEqual([
      ['fee', -250],
      ['deposit', 100000],
    ])
    await expect(
      addMovement(db, alex, account.id, { kind: 'buy', on: '2026-02-01', amount: '1' }, now),
    ).rejects.toThrow(AuthError)
    await expect(
      addMovement(db, alex, account.id, { kind: 'deposit', on: '2026-04-01', amount: '1' }, now),
    ).rejects.toThrow('future')
    await expect(
      addMovement(db, alex, account.id, { kind: 'deposit', on: 'soon', amount: '1' }, now),
    ).rejects.toThrow('date')
    await expect(
      addMovement(db, alex, account.id, { kind: 'deposit', on: '2026-02-01', amount: '0' }, now),
    ).rejects.toThrow('amount')
    await expect(
      addMovement(db, sam, account.id, { kind: 'deposit', on: '2026-02-01', amount: '1' }, now),
    ).rejects.toThrow(AuthError)
    await expect(removeMovement(db, robin, dep.id)).rejects.toThrow(AuthError)

    await removeMovement(db, alex, dep.id)
    expect(await listMovements(db, alex)).toHaveLength(1)
    await expect(removeMovement(db, alex, dep.id)).rejects.toThrow(AuthError)
  })

  it('charts value against money put in, in the display currency', async () => {
    const { household, alex, sam } = await home()
    const account = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    const hidden = await createInvestmentAccount(db, sam, {
      name: 'Sam only',
      currency: 'ILS',
      visibility: 'private',
    })
    await saveHolding(db, sam, hidden.id, { kind: 'cash', currency: 'ILS', units: '999' })
    const now = day('2026-03-01')
    await addMovement(
      db,
      alex,
      account.id,
      { kind: 'deposit', on: '2026-01-01', amount: '100' },
      now,
    )
    await saveHolding(db, alex, account.id, { kind: 'cash', currency: 'USD', units: '100' })
    await recordSnapshots(db, household.id, rates, day('2026-01-01'))
    await saveHolding(db, alex, account.id, { kind: 'cash', currency: 'USD', units: '110' })
    await recordSnapshots(db, household.id, rates, day('2026-02-01'))

    const t = await trends(db, { ...alex, displayCurrency: 'ILS' }, 'all', rates, now, {
      url: null,
    })
    expect(t.series).toEqual([
      { on: '2026-01-01', valueMinor: 40000, contributedMinor: 40000 },
      { on: '2026-02-01', valueMinor: 44000, contributedMinor: 40000 },
    ])
    expect(t.rangeReturn).toBeCloseTo(0.1, 10)
    expect(t.since).toBe('2026-01-01')
    expect(t.years[0]).toMatchObject({ year: 2026, deposits: 40000 })

    const noRate = await trends(db, { ...alex, displayCurrency: 'EUR' }, '1m', new Map(), now, {
      url: null,
    })
    expect(noRate.missingRates).toEqual(['USD'])
    expect(noRate.series).toEqual([])
  })

  it('fills the chart in from past prices before values were recorded', async () => {
    const { household, alex } = await home()
    const account = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    const now = day('2026-03-01')
    await saveHolding(
      db,
      alex,
      account.id,
      {
        kind: 'security',
        symbol: 'TST1',
        name: 'Test fund',
        currency: 'USD',
        assetClass: 'global_stocks',
        units: '10',
        price: '110',
      },
      now,
    )
    await saveHolding(db, alex, account.id, { kind: 'cash', currency: 'USD', units: '50' }, now)
    const [fund] = await db
      .select()
      .from(schema.instruments)
      .where(raw`kind = 'security'`)
    for (const [on, price] of [
      ['2026-02-10', '100'],
      ['2026-02-20', '90'],
    ] as const)
      await db
        .insert(schema.instrumentPrices)
        .values({ instrumentId: fund!.id, price, pricedAt: day(on), source: 'manual' })
    const ils = { ...alex, displayCurrency: 'ILS' }
    // Money put in during the estimated stretch is already in today's holdings.
    await addMovement(
      db,
      alex,
      account.id,
      { kind: 'deposit', on: '2026-02-15', amount: '1000' },
      now,
    )

    // Nothing recorded yet: past prices and today's value make the line.
    const before = await trends(db, ils, '1m', rates, now, { url: null })
    expect(before.series.map((p) => [p.on, p.valueMinor])).toEqual([
      ['2026-02-10', (1000 + 50) * 400],
      ['2026-02-20', (900 + 50) * 400],
      ['2026-03-01', (1100 + 50) * 400],
    ])
    expect(before.estimatedUntil).toBe('2026-03-01')
    expect(before.series.every((p) => p.contributedMinor === 400000)).toBe(true)
    expect(before.rangeReturn).toBeCloseTo(1150 / 1050 - 1, 10)
    expect(before.years).toMatchObject([{ year: 2026, deposits: 400000, returnRate: null }])
    expect(before.since).toBeNull()

    // Once a value is recorded, the estimate stops there and recorded values take over.
    await recordSnapshots(db, household.id, rates, day('2026-02-25'))
    const after = await trends(db, ils, '1m', rates, now, { url: null })
    expect(after.series.at(-1)).toMatchObject({ on: '2026-02-25', valueMinor: 1150 * 400 })
    expect(after.series.map((p) => p.on)).toEqual(['2026-02-10', '2026-02-20', '2026-02-25'])
    expect(after.estimatedUntil).toBe('2026-02-25')
  })
})
