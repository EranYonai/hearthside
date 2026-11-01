import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { parseStatement } from '@hearthside/core'
import { createDb, initEncryption, migrateDb, schema } from '@hearthside/db'
import { eq, sql as raw } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commitImport, createAccount, prepareImport, totals, undoBatch } from './ledger'
import {
  createLoan,
  createProperty,
  deleteProperty,
  exampleCandidates,
  getLoan,
  linkLoansAndRent,
  listLoans,
  listProperties,
  loanDetail,
  propertyDetail,
  setLoanBalance,
  setPaymentExample,
  setRentExample,
  updateLoan,
} from './loans'
import { acceptInvite, createHousehold, createInvite, type NewPasskey } from './repo'
import { wealth } from './wealth'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']

let n = 0
const passkey = (): NewPasskey => ({
  id: `loans-cred-${++n}`,
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
  const { member: kid } = await acceptInvite(db, {
    token: (await createInvite(db, alex, 'viewer')).token,
    name: 'Kid',
    passkey: passkey(),
  })
  return { alex, sam, kid }
}

// Synthetic rows only.
const header = ['תאריך', 'תיאור', 'חובה', 'זכות', 'יתרה']
const bankRows = (rows: string[][]) =>
  parseStatement([{ name: 'S', rows: [header, ...rows] }], { spendingIsPositive: false })
    .transactions

const now = new Date('2026-10-31T12:00:00Z')
const rates = new Map([['USD/ILS', 4]])

const property = {
  name: 'The flat',
  currency: 'ILS',
  value: '2,000,000',
  valueOn: '2026-10-01',
  purchase: '1,500,000',
  purchasedOn: '2020-01-01',
  rent: '5,000',
  visibility: 'household',
}

const mortgage = {
  name: 'Flat mortgage',
  kind: 'mortgage',
  lender: 'Lender',
  currency: 'ILS',
  principal: '1,000,000',
  rate: '4.5',
  termMonths: 360,
  startOn: '2020-01-15',
  visibility: 'household',
}

async function importBank(member: Awaited<ReturnType<typeof home>>['alex']) {
  const bank = await createAccount(db, member, {
    name: 'Main',
    kind: 'bank',
    visibility: 'household',
  })
  const rows = bankRows([
    ['15/10/2026', 'MORTGAGE PAYMENT', '5,066.85', '', '20,000.00'],
    ['15/09/2026', 'MORTGAGE PAYMENT', '5,066.85', '', '25,066.85'],
    ['12/10/2026', 'MORTGAGE PAYMENT', '900.00', '', '25,066.85'],
    ['05/10/2026', 'RENT FROM TENANT', '', '5,000.00', '30,133.70'],
    ['05/09/2026', 'RENT FROM TENANT', '', '5,000.00', '25,133.70'],
    ['01/10/2026', 'Groceries', '300.00', '', '20,133.70'],
  ])
  const batch = await commitImport(db, member, bank, {
    fileName: 'oct.pdf',
    fileHash: 'loans-1',
    rows: await prepareImport(db, bank, rows),
    skipped: 0,
  })
  const all = await db.select().from(schema.transactions)
  const by = (d: string, amount: number) =>
    all.find((t) => t.description === d && t.amountMinor === amount)!
  return { bank, batch, by }
}

describe.skipIf(!url)('loans and property (Postgres)', () => {
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

  it('keeps property and loan numbers sealed and checks input', async () => {
    const { alex, kid } = await home()
    const p = await createProperty(db, alex, property, now)
    expect(p).toMatchObject({
      valueMinor: 200_000_000,
      purchaseMinor: 150_000_000,
      rentMinor: 500_000,
    })
    const [row] = (await db.execute(
      raw`select value_minor, name from properties where id = ${p.id}`,
    )) as unknown as { value_minor: string; name: string }[]
    expect(row!.value_minor).not.toContain('200000000')
    expect(row!.name).not.toContain('flat')

    await expect(createProperty(db, kid, property)).rejects.toThrow(/Viewers/)
    await expect(createProperty(db, alex, { ...property, value: '-5' })).rejects.toThrow(/positive/)
    await expect(createLoan(db, alex, { ...mortgage, rate: 'lots' })).rejects.toThrow(/rate/)
    await expect(createLoan(db, alex, { ...mortgage, termMonths: 0 })).rejects.toThrow(/term/)
    await expect(createLoan(db, alex, { ...mortgage, kind: 'boat' })).rejects.toThrow(/kind/)
    await expect(createLoan(db, alex, { ...mortgage, startOn: 'soon' })).rejects.toThrow(/start/)
  })

  it('keeps private ones to their people', async () => {
    const { alex, sam } = await home()
    const p = await createProperty(db, sam, { ...property, visibility: 'private' })
    await createLoan(db, sam, { ...mortgage, visibility: 'private', propertyId: p.id })
    expect(await listProperties(db, alex)).toHaveLength(0)
    expect(await listLoans(db, alex)).toHaveLength(0)
    expect(await listProperties(db, sam)).toHaveLength(1)
    // Alex can't tie a loan to Sam's private property.
    await expect(createLoan(db, alex, { ...mortgage, propertyId: p.id })).rejects.toThrow(
      /property/,
    )
  })

  it('only lets the person whose it is change it', async () => {
    const { alex, sam } = await home()
    const loan = await createLoan(db, sam, mortgage)
    // The household owner may; another adult may not.
    await updateLoan(db, alex, loan.id, { ...mortgage, name: 'Renamed' })
    const { member: other } = await acceptInvite(db, {
      token: (await createInvite(db, alex, 'adult')).token,
      name: 'Other',
      passkey: passkey(),
    })
    await expect(updateLoan(db, other, loan.id, mortgage)).rejects.toThrow(/belongs/)
    expect((await getLoan(db, sam, loan.id)).name).toBe('Renamed')
  })

  it('ties rent and loan payments from the bank, and files payments under Loans', async () => {
    const { alex } = await home()
    const p = await createProperty(db, alex, property, now)
    const loan = await createLoan(db, alex, { ...mortgage, propertyId: p.id })
    const { by, batch } = await importBank(alex)

    const out = await exampleCandidates(db, alex, 'out', 506_685, now)
    expect(out[0]!.description).toBe('MORTGAGE PAYMENT')
    expect(out.every((c) => c.minor < 0)).toBe(true)
    const inn = await exampleCandidates(db, alex, 'in', 500_000, now)
    expect(inn.map((c) => c.description)).toEqual(['RENT FROM TENANT', 'RENT FROM TENANT'])

    await expect(setRentExample(db, alex, p.id, by('Groceries', -30_000).id)).rejects.toThrow(
      /coming in/,
    )
    expect(await setRentExample(db, alex, p.id, by('RENT FROM TENANT', 500_000).id)).toBe(2)
    expect(await setPaymentExample(db, alex, loan.id, by('MORTGAGE PAYMENT', -506_685).id)).toBe(2)

    const rows = await db.select().from(schema.transactions)
    const tied = rows.filter((r) => r.loanId === loan.id)
    // The small one with the same description is far off the payment: not tied.
    expect(tied.map((r) => r.amountMinor)).toEqual([-506_685, -506_685])
    expect(tied.every((r) => r.category === 'loans')).toBe(true)
    expect(
      rows.filter((r) => r.rentPropertyId === p.id).every((r) => r.category === 'income'),
    ).toBe(true)

    // The full payment still counts as spending, under Loans (with the small row, filed there by
    // its description alone).
    const sum = await totals(db, alex, { month: '2026-10' })
    expect(sum.byCategory.find((c) => c.category === 'loans')?.minor).toBe(-506_685 - 90_000)

    // Detail pages.
    const ld = await loanDetail(db, alex, loan.id, now)
    expect(ld.payments).toHaveLength(2)
    for (const pay of ld.payments) expect(pay.interestMinor + pay.principalMinor).toBe(506_685)
    expect(ld.property?.id).toBe(p.id)
    const pd = await propertyDetail(db, alex, p.id, now)
    expect(pd.rent.monthlyMinor).toBe(500_000)
    expect(pd.rents).toHaveLength(2)
    expect(pd.equityMinor).toBe(200_000_000 - ld.balanceMinor)

    // Undoing the import takes the rows away; nothing stays tied.
    await undoBatch(db, alex, batch.id)
    expect((await loanDetail(db, alex, loan.id, now)).payments).toHaveLength(0)

    // Stopping keeps the rows but unties them.
    await importBank(alex).catch(() => undefined)
    await setPaymentExample(db, alex, loan.id, null)
    expect((await db.select().from(schema.transactions)).some((r) => r.loanId)).toBe(false)
  })

  it('leaves a category someone picked by hand alone', async () => {
    const { alex } = await home()
    const loan = await createLoan(db, alex, mortgage)
    const { by } = await importBank(alex)
    const pay = by('MORTGAGE PAYMENT', -506_685)
    await db
      .update(schema.transactions)
      .set({ category: 'home', categorySource: 'manual' })
      .where(eq(schema.transactions.id, pay.id))
    await setPaymentExample(db, alex, loan.id, pay.id)
    const [after] = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, pay.id))
    expect(after).toMatchObject({ loanId: loan.id, category: 'home' })
    expect(await linkLoansAndRent(db, alex.householdId)).toBe(0)
  })

  it('counts property toward wealth and takes loans off', async () => {
    const { alex } = await home()
    const p = await createProperty(db, alex, property, now)
    const loan = await createLoan(db, alex, { ...mortgage, propertyId: p.id })
    await setLoanBalance(db, alex, loan.id, { balance: '800,000', on: '2026-10-31' }, now)
    const w = await wealth(db, alex, rates, now)
    expect(w).toMatchObject({
      any: true,
      propertyMinor: 200_000_000,
      owedMinor: 80_000_000,
      ownMinor: 200_000_000,
      totalMinor: 120_000_000,
    })
    expect(w.parts.map((x) => [x.kind, x.href])).toEqual([['property', `/invest/property/${p.id}`]])
    expect(w.owed.map((x) => [x.kind, x.minor])).toEqual([['loan', 80_000_000]])
    expect(w.series.at(-1)).toMatchObject({ totalMinor: 120_000_000, owedMinor: 80_000_000 })
    // Earlier weeks owed a little more.
    expect(w.series[0]!.owedMinor).toBeGreaterThan(80_000_000)

    await expect(
      setLoanBalance(db, alex, loan.id, { balance: '1', on: '2019-01-01' }, now),
    ).rejects.toThrow(/before/)
    // Clearing goes back to the schedule.
    await setLoanBalance(db, alex, loan.id, { balance: '' }, now)
    expect((await getLoan(db, alex, loan.id)).balanceMinor).toBeNull()

    // Deleting the property keeps the loan, untied.
    await deleteProperty(db, alex, p.id)
    expect((await getLoan(db, alex, loan.id)).propertyId).toBeNull()
  })
})
