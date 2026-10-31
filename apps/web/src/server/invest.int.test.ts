import { randomBytes } from 'node:crypto'
import { createDb, initEncryption, migrateDb } from '@hearthside/db'
import { sql as raw } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanHolding,
  createInvestmentAccount,
  deleteInvestmentAccount,
  getVisibleInvestmentAccount,
  importHoldings,
  listHoldings,
  listInvestmentAccounts,
  mayManage,
  portfolio,
  removeHolding,
  saveHolding,
  updateInvestmentAccount,
} from './invest'
import { acceptInvite, AuthError, createHousehold, createInvite, type NewPasskey } from './repo'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `invest-cred-${++n}`,
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
  const join = async (role: 'adult' | 'viewer', name: string) =>
    (
      await acceptInvite(db, {
        token: (await createInvite(db, alex, role)).token,
        name,
        passkey: passkey(),
      })
    ).member
  return { alex, sam: await join('adult', 'Sam'), robin: await join('viewer', 'Robin') }
}

// Synthetic instruments only.
const fund = {
  kind: 'security',
  symbol: ' tst1 ',
  name: 'Test World Index Fund',
  currency: 'USD',
  assetClass: 'global_stocks',
  units: '10.5',
  price: '100',
}

afterAll(async () => {
  await client?.sql.end()
})

describe.skipIf(!url)('investments (Postgres)', () => {
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

  it('keeps private accounts to their owner and holder', async () => {
    const { alex, sam, robin } = await home()
    const shared = await createInvestmentAccount(db, alex, {
      name: 'Shared savings',
      currency: 'ILS',
      visibility: 'household',
    })
    const mine = await createInvestmentAccount(db, sam, {
      name: 'Sam pension',
      provider: 'Some provider',
      currency: 'USD',
      visibility: 'private',
    })
    const forRobin = await createInvestmentAccount(db, alex, {
      name: 'Robin fund',
      currency: 'ILS',
      visibility: 'private',
      holderId: robin.id,
    })

    expect((await listInvestmentAccounts(db, alex)).map((a) => a.id)).toEqual([
      shared.id,
      forRobin.id,
    ])
    expect((await listInvestmentAccounts(db, sam)).map((a) => a.id)).toEqual([shared.id, mine.id])
    expect((await listInvestmentAccounts(db, robin)).map((a) => a.id)).toEqual([
      shared.id,
      forRobin.id,
    ])
    await expect(getVisibleInvestmentAccount(db, alex, mine.id)).rejects.toThrow(AuthError)
    expect(mine.provider).toBe('Some provider')
  })

  it('stores names, units and prices sealed', async () => {
    const { alex } = await home()
    const account = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    await saveHolding(db, alex, account.id, { ...fund, cost: '900' })
    const [stored] = (await db.execute(
      raw`select a.name, i.symbol, i.symbol_key, h.units, h.cost_minor, p.price
          from holdings h join instruments i on i.id = h.instrument_id
          join investment_accounts a on a.id = h.account_id
          join instrument_prices p on p.instrument_id = i.id`,
    )) as unknown as Record<string, string>[]
    for (const v of Object.values(stored!)) {
      expect(v).not.toMatch(/Long term|TST1|10\.5|90000|^100$/)
    }
  })

  it('adds, updates and removes holdings, and sums the portfolio', async () => {
    const { alex, sam, robin } = await home()
    const account = await createInvestmentAccount(db, alex, {
      name: 'Long term',
      currency: 'USD',
      visibility: 'household',
    })
    const first = await saveHolding(db, alex, account.id, fund)
    // Same symbol again replaces the units rather than adding a second row.
    const again = await saveHolding(
      db,
      alex,
      account.id,
      { ...fund, symbol: 'TST1', units: '12', price: '110' },
      new Date(Date.now() + 1000),
    )
    expect(again.id).toBe(first.id)
    await saveHolding(db, alex, account.id, { kind: 'cash', currency: 'ILS', units: '1,000' })
    await saveHolding(db, alex, account.id, {
      kind: 'security',
      symbol: 'NOPRICE',
      name: 'Unpriced bond fund',
      currency: 'ILS',
      assetClass: 'bonds',
      units: '3',
    })

    const list = await listHoldings(db, sam)
    expect(list.map((h) => [h.symbol, h.units, h.price, h.valueMinor])).toEqual([
      ['TST1', '12', '110', 132000],
      ['ILS', '1000', '1', 100000],
      ['NOPRICE', '3', null, null],
    ])
    expect(list[0]!.priceSource).toBe('manual')

    const p = await portfolio(db, { ...alex, displayCurrency: 'ILS' }, new Map([['USD/ILS', 3.5]]))
    expect(p.summary.totalMinor).toBe(132000 * 3.5 + 100000)
    expect(p.summary.unpriced).toBe(1)
    expect(p.allocation.map((s) => [s.slug, s.percent])).toEqual([
      ['global_stocks', 82],
      ['cash', 18],
    ])
    const noRate = await portfolio(db, { ...alex, displayCurrency: 'ILS' })
    expect(noRate.summary.unconverted).toEqual({ USD: 132000 })

    // Viewers look; adults who don't hold the account can't change it.
    await expect(saveHolding(db, robin, account.id, fund)).rejects.toThrow(AuthError)
    await expect(saveHolding(db, sam, account.id, fund)).rejects.toThrow(AuthError)
    await expect(removeHolding(db, sam, first.id)).rejects.toThrow(AuthError)

    await removeHolding(db, alex, first.id)
    expect((await listHoldings(db, alex)).map((h) => h.symbol)).toEqual(['ILS', 'NOPRICE'])
    await expect(removeHolding(db, alex, first.id)).rejects.toThrow(AuthError)
  })

  it('lets the owner or holder edit and delete an account', async () => {
    const { alex, sam, robin } = await home()
    const account = await createInvestmentAccount(db, sam, {
      name: 'Sam fund',
      currency: 'ILS',
      visibility: 'household',
    })
    expect(mayManage(sam, account)).toBe(true)
    expect(mayManage(alex, account)).toBe(true) // household owner
    expect(mayManage(robin, account)).toBe(false)

    const updated = await updateInvestmentAccount(db, sam, account.id, {
      name: 'Renamed',
      currency: 'EUR',
      visibility: 'private',
      holderId: alex.id,
    })
    expect(updated).toMatchObject({ name: 'Renamed', currency: 'EUR', holderId: alex.id })
    await expect(
      updateInvestmentAccount(db, robin, account.id, {
        name: 'x',
        currency: 'ILS',
        visibility: 'household',
      }),
    ).rejects.toThrow(AuthError)
    await expect(
      createInvestmentAccount(db, robin, { name: 'x', currency: 'ILS', visibility: 'household' }),
    ).rejects.toThrow(AuthError)
    await expect(
      createInvestmentAccount(db, sam, {
        name: 'x',
        currency: 'ILS',
        visibility: 'household',
        holderId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(AuthError)

    await saveHolding(db, sam, account.id, { kind: 'cash', currency: 'EUR', units: '5' })
    await deleteInvestmentAccount(db, sam, account.id)
    expect(await listInvestmentAccounts(db, sam)).toEqual([])
    expect(await listHoldings(db, sam)).toEqual([])
  })
})

describe.skipIf(!url)('holdings import (Postgres)', () => {
  it('adds, updates and removes imported holdings, keeping hand-added ones', async () => {
    await db.execute(raw`truncate households, audit_log, auth_challenges cascade`)
    const { alex, sam } = await home()
    const account = await createInvestmentAccount(db, alex, {
      name: 'Imported',
      currency: 'ILS',
      visibility: 'household',
    })
    await saveHolding(db, alex, account.id, { kind: 'cash', currency: 'ILS', units: '100' })
    // A member's own name and asset type for a symbol survive later imports.
    await saveHolding(db, alex, account.id, {
      kind: 'security',
      symbol: '1111111',
      name: 'My name for it',
      currency: 'ILS',
      assetClass: 'bonds',
      units: '1',
    })
    const row = (symbol: string, units: string, price: string | null = '10') => ({
      symbol,
      name: `Fund ${symbol}`,
      units,
      price: price ?? undefined,
      currency: 'ILS',
      assetClass: 'local_stocks',
    })

    expect(
      await importHoldings(db, alex, account.id, [row('1111111', '5'), row('2222222', '7')], {
        removeMissing: true,
      }),
    ).toEqual({ added: 1, updated: 1, removed: 0 })
    expect(
      await importHoldings(db, alex, account.id, [row('2222222', '8', null)], {
        removeMissing: true,
      }),
    ).toEqual({ added: 0, updated: 1, removed: 1 })

    const list = await listHoldings(db, alex)
    expect(list.map((h) => [h.symbol, h.units, h.price])).toEqual([
      ['ILS', '100', '1'],
      ['2222222', '8', '10'],
    ])
    await importHoldings(db, alex, account.id, [row('1111111', '2')], { removeMissing: false })
    const again = await listHoldings(db, alex)
    expect(again.find((h) => h.symbol === '1111111')).toMatchObject({
      name: 'My name for it',
      assetClass: 'bonds',
    })
    expect(again).toHaveLength(3)

    await expect(
      importHoldings(db, sam, account.id, [row('3', '1')], { removeMissing: false }),
    ).rejects.toThrow(AuthError)
    await expect(
      importHoldings(db, alex, account.id, [], { removeMissing: false }),
    ).rejects.toThrow(AuthError)
    await expect(
      importHoldings(db, alex, account.id, [{ ...row('4', '1'), units: 'x' }], {
        removeMissing: false,
      }),
    ).rejects.toThrow(AuthError)
  })
})

describe('cleanHolding', () => {
  it('validates what the member typed', () => {
    expect(cleanHolding({ ...fund, cost: '1,050.5' })).toMatchObject({
      symbol: 'TST1',
      units: '10.5',
      price: '100',
      costMinor: 105050,
    })
    expect(cleanHolding({ kind: 'cash', currency: 'USD', units: '3' })).toMatchObject({
      symbol: 'USD',
      assetClass: 'cash',
      price: null,
    })
    const bad: Record<string, unknown>[] = [
      { kind: 'crypto' },
      { currency: 'XYZ' },
      { units: '-1' },
      { symbol: '' },
      { name: '' },
      { assetClass: 'crypto' },
      { price: 'abc' },
      { cost: 'abc' },
    ]
    for (const b of bad) expect(() => cleanHolding({ ...fund, ...b } as never)).toThrow(AuthError)
  })
})
