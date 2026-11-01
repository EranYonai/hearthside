import {
  convertMinor,
  isHoldingCurrency,
  isLoanKind,
  linkCandidates,
  loanBalanceOn,
  loanPayment,
  matchLinks,
  MAX_TERM_MONTHS,
  monthsLeft,
  parseAmount,
  parseRate,
  rentSummary,
  splitPayments,
  type LinkRule,
  type LoanTerms,
  type Minor,
  type Rates,
} from '@hearthside/core'
import type { Db, LoanRow, MemberRow, PropertyRow } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, desc, eq, gte, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm'
import { cleanName } from './http'
import { canEdit } from './ledger'
import { audit, AuthError, type Tx } from './repo'

const { properties, loans, transactions, accounts, members } = schema

type Conn = Db | Tx
type Visibility = 'household' | 'private'

/**
 * Real estate and loans. A property's value is typed in; a loan's balance follows its schedule.
 * Rent and loan payments are bank rows, tied to a property or loan by picking one example row
 * (see links.ts in core). Loan payments still count as spending (category "Loans"); the loan's
 * balance going down is what keeps net worth right.
 */

// ---------- Who sees and changes what ----------

type Owned = {
  householdId: string
  visibility: Visibility
  ownerId: string
  holderId: string | null
}

function visibleProperty(member: MemberRow): SQL {
  return and(
    eq(properties.householdId, member.householdId),
    or(
      eq(properties.visibility, 'household'),
      eq(properties.ownerId, member.id),
      eq(properties.holderId, member.id),
    ),
  )!
}

function visibleLoan(member: MemberRow): SQL {
  return and(
    eq(loans.householdId, member.householdId),
    or(
      eq(loans.visibility, 'household'),
      eq(loans.ownerId, member.id),
      eq(loans.holderId, member.id),
    ),
  )!
}

/** Whoever added it, whoever it belongs to, or the household owner may change it. */
export function mayManage(
  member: Pick<MemberRow, 'id' | 'role'>,
  row: Pick<Owned, 'ownerId' | 'holderId'>,
) {
  if (!canEdit(member)) return false
  return member.role === 'owner' || row.ownerId === member.id || row.holderId === member.id
}

function assertManage(member: MemberRow, row: Owned) {
  if (!mayManage(member, row))
    throw new AuthError('not_allowed', 'Only the person this belongs to can change it')
}

export function holderOf(row: Pick<Owned, 'ownerId' | 'holderId'>): string {
  return row.holderId ?? row.ownerId
}

async function checkHolder(db: Conn, member: MemberRow, value: unknown): Promise<string | null> {
  const id = typeof value === 'string' && value ? value : null
  if (!id || id === member.id) return null
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.id, id),
        eq(members.householdId, member.householdId),
        isNull(members.removedAt),
      ),
    )
  if (!row) throw new AuthError('not_found', 'That person isn’t in this home')
  return id
}

// ---------- Input checks ----------

function checkVisibility(value: unknown): Visibility {
  if (value !== 'household' && value !== 'private')
    throw new AuthError('not_allowed', 'Pick who can see it')
  return value
}

function checkCurrency(value: unknown): string {
  if (!isHoldingCurrency(value)) throw new AuthError('not_allowed', 'Pick a currency from the list')
  return value
}

function checkName(value: unknown): string {
  const name = cleanName(value)
  if (!name) throw new AuthError('not_allowed', 'Give it a name, up to 60 characters')
  return name
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const text = cleanName(value)
  if (!text) throw new AuthError('not_allowed', 'Keep it under 60 characters')
  return text
}

/** A positive amount typed by a person. Empty gives null when `optional`. */
function money(value: unknown, what: string, optional: true): Minor | null
function money(value: unknown, what: string, optional?: false): Minor
function money(value: unknown, what: string, optional = false): Minor | null {
  const text =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
  if (!text) {
    if (optional) return null
    throw new AuthError('not_allowed', `Enter ${what}`)
  }
  const minor = parseAmount(text)
  if (minor === undefined || !Number.isSafeInteger(minor) || minor <= 0)
    throw new AuthError('not_allowed', `Enter ${what} as a positive amount, like 1,250,000`)
  return minor
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function day(value: unknown, what: string, optional: true): string | null
function day(value: unknown, what: string, optional?: false): string
function day(value: unknown, what: string, optional = false): string | null {
  if ((value === undefined || value === null || value === '') && optional) return null
  if (typeof value !== 'string' || !DAY.test(value) || Number.isNaN(Date.parse(value)))
    throw new AuthError('not_allowed', `Pick ${what}`)
  return value
}

// ---------- Properties ----------

export async function listProperties(db: Conn, member: MemberRow) {
  return db.select().from(properties).where(visibleProperty(member)).orderBy(properties.createdAt)
}

export async function getProperty(db: Conn, member: MemberRow, id: string) {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(visibleProperty(member), eq(properties.id, id)))
  if (!row) throw new AuthError('not_found', 'That property isn’t here')
  return row
}

export interface PropertyInput {
  name: unknown
  currency: unknown
  value: unknown
  /** The day the value is from; today when left out. */
  valueOn?: unknown
  purchase?: unknown
  purchasedOn?: unknown
  rent?: unknown
  visibility: unknown
  holderId?: unknown
}

function propertyFields(input: PropertyInput, today: string) {
  return {
    name: checkName(input.name),
    currency: checkCurrency(input.currency),
    valueMinor: money(input.value, 'what it’s worth'),
    valueOn: day(input.valueOn, 'the day of the value', true) ?? today,
    purchaseMinor: money(input.purchase, 'the price paid', true),
    purchasedOn: day(input.purchasedOn, 'the purchase date', true),
    rentMinor: money(input.rent, 'the monthly rent', true),
    visibility: checkVisibility(input.visibility),
  }
}

export async function createProperty(
  db: Conn,
  member: MemberRow,
  input: PropertyInput,
  now = new Date(),
) {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change data')
  const fields = propertyFields(input, today(now))
  const holderId = await checkHolder(db, member, input.holderId)
  const [row] = await db
    .insert(properties)
    .values({ householdId: member.householdId, ownerId: member.id, holderId, ...fields })
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'property.created',
    detail: { propertyId: row!.id },
  })
  return row!
}

export async function updateProperty(
  db: Conn,
  member: MemberRow,
  id: string,
  input: PropertyInput,
  now = new Date(),
) {
  const current = await getProperty(db, member, id)
  assertManage(member, current)
  const fields = propertyFields(input, today(now))
  const holderId = await checkHolder(db, member, input.holderId)
  const [row] = await db
    .update(properties)
    .set({
      ...fields,
      ...(typeof input.holderId === 'string' && input.holderId
        ? { holderId: input.holderId === current.ownerId ? null : (holderId ?? member.id) }
        : {}),
    })
    .where(eq(properties.id, id))
    .returning()
  await linkLoansAndRent(db, member.householdId)
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'property.updated',
    detail: { propertyId: id },
  })
  return row!
}

export async function deleteProperty(db: Conn, member: MemberRow, id: string) {
  const current = await getProperty(db, member, id)
  assertManage(member, current)
  await db.delete(properties).where(eq(properties.id, id))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'property.deleted',
    detail: { propertyId: id },
  })
}

// ---------- Loans ----------

export async function listLoans(db: Conn, member: MemberRow) {
  return db.select().from(loans).where(visibleLoan(member)).orderBy(loans.createdAt)
}

export async function getLoan(db: Conn, member: MemberRow, id: string) {
  const [row] = await db
    .select()
    .from(loans)
    .where(and(visibleLoan(member), eq(loans.id, id)))
  if (!row) throw new AuthError('not_found', 'That loan isn’t here')
  return row
}

export interface LoanInput {
  name: unknown
  kind: unknown
  lender?: unknown
  currency: unknown
  principal: unknown
  rate: unknown
  termMonths: unknown
  startOn: unknown
  payment?: unknown
  propertyId?: unknown
  visibility: unknown
  holderId?: unknown
}

async function loanFields(db: Conn, member: MemberRow, input: LoanInput) {
  if (!isLoanKind(input.kind)) throw new AuthError('not_allowed', 'Pick what kind of loan it is')
  const rate = parseRate(input.rate)
  if (rate === null) throw new AuthError('not_allowed', 'Enter the yearly interest rate, like 4.5')
  const term = Number(input.termMonths)
  if (!Number.isInteger(term) || term < 1 || term > MAX_TERM_MONTHS)
    throw new AuthError('not_allowed', 'Enter the term in months, from 1 to 600')
  let propertyId: string | null = null
  if (typeof input.propertyId === 'string' && input.propertyId) {
    propertyId = (await getProperty(db, member, input.propertyId)).id
  }
  return {
    name: checkName(input.name),
    kind: input.kind,
    lender: optionalText(input.lender),
    currency: checkCurrency(input.currency),
    principalMinor: money(input.principal, 'the amount borrowed'),
    rate: String(rate),
    termMonths: term,
    startOn: day(input.startOn, 'the start date'),
    paymentMinor: money(input.payment, 'the monthly payment', true),
    propertyId,
    visibility: checkVisibility(input.visibility),
  }
}

export async function createLoan(db: Conn, member: MemberRow, input: LoanInput) {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change data')
  const fields = await loanFields(db, member, input)
  const holderId = await checkHolder(db, member, input.holderId)
  const [row] = await db
    .insert(loans)
    .values({ householdId: member.householdId, ownerId: member.id, holderId, ...fields })
    .returning()
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'loan.created',
    detail: { loanId: row!.id, kind: fields.kind },
  })
  return row!
}

export async function updateLoan(db: Conn, member: MemberRow, id: string, input: LoanInput) {
  const current = await getLoan(db, member, id)
  assertManage(member, current)
  const fields = await loanFields(db, member, input)
  const holderId = await checkHolder(db, member, input.holderId)
  const [row] = await db
    .update(loans)
    .set({
      ...fields,
      ...(typeof input.holderId === 'string' && input.holderId
        ? { holderId: input.holderId === current.ownerId ? null : (holderId ?? member.id) }
        : {}),
    })
    .where(eq(loans.id, id))
    .returning()
  await linkLoansAndRent(db, member.householdId)
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'loan.updated',
    detail: { loanId: id },
  })
  return row!
}

/** A balance from the lender's statement. Empty forgets it and goes back to the schedule. */
export async function setLoanBalance(
  db: Conn,
  member: MemberRow,
  id: string,
  input: { balance: unknown; on?: unknown },
  now = new Date(),
) {
  const current = await getLoan(db, member, id)
  assertManage(member, current)
  const empty = typeof input.balance !== 'string' || input.balance.trim() === ''
  let balanceMinor: Minor | null = null
  if (!empty) {
    const minor = parseAmount(String(input.balance))
    if (minor === undefined || !Number.isSafeInteger(minor) || minor < 0)
      throw new AuthError('not_allowed', 'Enter what’s still owed, like 640,000')
    balanceMinor = minor
  }
  const on = empty ? null : (day(input.on, 'the day of the balance', true) ?? today(now))
  if (on && on < current.startOn)
    throw new AuthError('not_allowed', 'The balance date can’t be before the loan started')
  await db.update(loans).set({ balanceMinor, balanceOn: on }).where(eq(loans.id, id))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'loan.balance_set',
    detail: { loanId: id },
  })
}

export async function deleteLoan(db: Conn, member: MemberRow, id: string) {
  const current = await getLoan(db, member, id)
  assertManage(member, current)
  await db.delete(loans).where(eq(loans.id, id))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'loan.deleted',
    detail: { loanId: id },
  })
}

// ---------- Tying bank rows ----------

/** A bank row this member can see, not a card bill. */
async function visibleBankRow(db: Conn, member: MemberRow, transactionId: string) {
  const [row] = await db
    .select({
      id: transactions.id,
      key: transactions.descriptionKey,
      amount: transactions.amountMinor,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(accounts.householdId, member.householdId),
        eq(accounts.kind, 'bank'),
        or(
          eq(accounts.visibility, 'household'),
          eq(accounts.ownerId, member.id),
          eq(accounts.holderId, member.id),
        ),
      ),
    )
  if (!row) throw new AuthError('not_found', 'That bank transaction isn’t here')
  return row
}

/** Rent for a property comes in as this bank row (and ones like it). Null stops tying rent. */
export async function setRentExample(
  db: Conn,
  member: MemberRow,
  propertyId: string,
  transactionId: string | null,
) {
  const current = await getProperty(db, member, propertyId)
  assertManage(member, current)
  if (transactionId === null) {
    await db.update(properties).set({ rentKey: null }).where(eq(properties.id, propertyId))
  } else {
    const row = await visibleBankRow(db, member, transactionId)
    if (row.amount <= 0)
      throw new AuthError('not_allowed', 'Rent is money coming in; pick a deposit')
    await db
      .update(properties)
      .set({ rentKey: row.key, rentMinor: current.rentMinor ?? row.amount })
      .where(eq(properties.id, propertyId))
  }
  return linkLoansAndRent(db, member.householdId)
}

/** A loan is paid by this bank row (and ones like it). Null stops tying payments. */
export async function setPaymentExample(
  db: Conn,
  member: MemberRow,
  loanId: string,
  transactionId: string | null,
) {
  const current = await getLoan(db, member, loanId)
  assertManage(member, current)
  if (transactionId === null) {
    await db.update(loans).set({ paymentKey: null }).where(eq(loans.id, loanId))
  } else {
    const row = await visibleBankRow(db, member, transactionId)
    if (row.amount >= 0) throw new AuthError('not_allowed', 'A loan payment is money going out')
    await db
      .update(loans)
      .set({ paymentKey: row.key, paymentMinor: current.paymentMinor ?? Math.abs(row.amount) })
      .where(eq(loans.id, loanId))
  }
  return linkLoansAndRent(db, member.householdId)
}

/**
 * Tie every bank row to the loan it pays or the property whose rent it is, and file it under
 * Loans or Income unless someone chose its category. Runs after every import and undo, and
 * after a loan or property changes. Returns how many rows changed.
 */
export async function linkLoansAndRent(db: Conn, householdId: string): Promise<number> {
  const [props, debts] = await Promise.all([
    db
      .select({ id: properties.id, key: properties.rentKey, minor: properties.rentMinor })
      .from(properties)
      .where(and(eq(properties.householdId, householdId), isNotNull(properties.rentKey))),
    db
      .select()
      .from(loans)
      .where(and(eq(loans.householdId, householdId), isNotNull(loans.paymentKey))),
  ])
  const rules: LinkRule[] = [
    ...props.map((p) => ({
      id: `p:${p.id}`,
      key: p.key!,
      expectedMinor: p.minor,
      direction: 'in' as const,
    })),
    ...debts.map((l) => ({
      id: `l:${l.id}`,
      key: l.paymentKey!,
      expectedMinor: loanPayment(terms(l)),
      direction: 'out' as const,
    })),
  ]
  const keys = [...new Set(rules.map((r) => r.key))]
  const where = [isNotNull(transactions.loanId), isNotNull(transactions.rentPropertyId)]
  if (keys.length) where.push(inArray(transactions.descriptionKey, keys))
  const rows = await db
    .select({
      id: transactions.id,
      key: transactions.descriptionKey,
      amount: transactions.amountMinor,
      loanId: transactions.loanId,
      rentPropertyId: transactions.rentPropertyId,
      cardBill: transactions.cardBill,
      category: transactions.category,
      categorySource: transactions.categorySource,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(transactions.householdId, householdId), eq(accounts.kind, 'bank'), or(...where)))
  const matches = matchLinks(
    rows.filter((r) => !r.cardBill).map((r) => ({ id: r.id, key: r.key, amountMinor: r.amount })),
    rules,
  )
  let changed = 0
  for (const r of rows) {
    const rule = matches.get(r.id)
    const loanId = rule?.startsWith('l:') ? rule.slice(2) : null
    const rentPropertyId = rule?.startsWith('p:') ? rule.slice(2) : null
    const category = loanId ? 'loans' : rentPropertyId ? 'income' : null
    const recategorize =
      category !== null &&
      r.category !== category &&
      (r.categorySource === null || r.categorySource === 'auto')
    if (loanId === r.loanId && rentPropertyId === r.rentPropertyId && !recategorize) continue
    await db
      .update(transactions)
      .set({
        loanId,
        rentPropertyId,
        ...(recategorize
          ? {
              category,
              categorySource: 'auto' as const,
              categoryVia: 'link',
              categoryConfidence: 1,
            }
          : {}),
      })
      .where(eq(transactions.id, r.id))
    changed++
  }
  return changed
}

/** Bring links up to date for every household, e.g. after an upgrade. */
export async function linkAllLoansAndRent(db: Conn): Promise<number> {
  let changed = 0
  for (const h of await db.select({ id: schema.households.id }).from(schema.households))
    changed += await linkLoansAndRent(db, h.id)
  return changed
}

export interface Candidate {
  id: string
  on: string
  description: string
  minor: Minor
  account: string
}

/** Recent bank rows a member could pick as the example: deposits for rent, debits for a loan. */
export async function exampleCandidates(
  db: Conn,
  member: MemberRow,
  direction: 'in' | 'out',
  expectedMinor: Minor | null,
  now = new Date(),
): Promise<Candidate[]> {
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10)
  const rows = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      description: transactions.description,
      amountMinor: transactions.amountMinor,
      cardBill: transactions.cardBill,
      account: accounts.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(accounts.householdId, member.householdId),
        eq(accounts.kind, 'bank'),
        or(
          eq(accounts.visibility, 'household'),
          eq(accounts.ownerId, member.id),
          eq(accounts.holderId, member.id),
        ),
        gte(transactions.occurredOn, since),
      ),
    )
    .orderBy(desc(transactions.occurredOn))
  return linkCandidates(
    rows.filter((r) => !r.cardBill),
    direction,
    expectedMinor,
  ).map((r) => ({
    id: r.id,
    on: r.occurredOn,
    description: r.description,
    minor: r.amountMinor,
    account: r.account,
  }))
}

/** Bank rows tied to a property's rent or a loan, newest first, that this member can see. */
async function linkedRows(db: Conn, member: MemberRow, by: SQL) {
  return db
    .select({
      id: transactions.id,
      on: transactions.occurredOn,
      minor: transactions.amountMinor,
      description: transactions.description,
      loanId: transactions.loanId,
      rentPropertyId: transactions.rentPropertyId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(accounts.householdId, member.householdId),
        or(
          eq(accounts.visibility, 'household'),
          eq(accounts.ownerId, member.id),
          eq(accounts.holderId, member.id),
        ),
        by,
      ),
    )
    .orderBy(desc(transactions.occurredOn))
}

// ---------- Views ----------

export function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function terms(l: LoanRow): LoanTerms {
  return {
    principalMinor: l.principalMinor,
    ratePercent: parseRate(l.rate) ?? 0,
    termMonths: l.termMonths,
    startOn: l.startOn,
    paymentMinor: l.paymentMinor,
    known:
      l.balanceMinor !== null && l.balanceOn ? { minor: l.balanceMinor, on: l.balanceOn } : null,
  }
}

export interface LoanView {
  loan: LoanRow
  balanceMinor: Minor
  paymentMinor: Minor
  monthsLeft: number | null
  /** How much of what was borrowed is paid back, 0..100. */
  paidPercent: number
}

export function loanView(l: LoanRow, now = new Date()): LoanView {
  const t = terms(l)
  const balanceMinor = loanBalanceOn(t, today(now))
  const paymentMinor = loanPayment(t)
  return {
    loan: l,
    balanceMinor,
    paymentMinor,
    monthsLeft: monthsLeft(balanceMinor, t.ratePercent, paymentMinor),
    paidPercent:
      l.principalMinor > 0
        ? Math.max(0, Math.min(100, Math.round((1 - balanceMinor / l.principalMinor) * 100)))
        : 0,
  }
}

/** One loan with its tied bank payments, split into interest and principal. */
export async function loanDetail(db: Conn, member: MemberRow, id: string, now = new Date()) {
  const loan = await getLoan(db, member, id)
  const rows = await linkedRows(db, member, eq(transactions.loanId, id))
  const property = loan.propertyId
    ? await getProperty(db, member, loan.propertyId).catch(() => null)
    : null
  return {
    ...loanView(loan, now),
    property,
    payments: splitPayments(
      terms(loan),
      rows.map((r) => ({ id: r.id, on: r.on, minor: r.minor })),
    ).map((p) => ({ ...p, description: rows.find((r) => r.id === p.id)?.description ?? '' })),
  }
}

/** One property with its rent and the loans secured on it. */
export async function propertyDetail(db: Conn, member: MemberRow, id: string, now = new Date()) {
  const property = await getProperty(db, member, id)
  const [rows, secured] = await Promise.all([
    linkedRows(db, member, eq(transactions.rentPropertyId, id)),
    db
      .select()
      .from(loans)
      .where(and(visibleLoan(member), eq(loans.propertyId, id))),
  ])
  const debts = secured.map((l) => loanView(l, now))
  const owedMinor = debts
    .filter((d) => d.loan.currency === property.currency)
    .reduce((n, d) => n + d.balanceMinor, 0)
  return {
    property,
    rent: rentSummary(
      rows.map((r) => ({ on: r.on, minor: r.minor })),
      property.valueMinor,
      today(now),
    ),
    rents: rows,
    loans: debts,
    equityMinor: property.valueMinor - owedMinor,
  }
}

export interface DebtsAndProperty {
  properties: { row: PropertyRow; minor: Minor | null; rentMonthlyMinor: Minor }[]
  loans: (LoanView & { minor: Minor | null })[]
}

/** Every property and loan this member can see, with today's numbers in `currency`. */
export async function debtsAndProperty(
  db: Conn,
  member: MemberRow,
  currency: string,
  rates: Rates,
  now = new Date(),
): Promise<DebtsAndProperty> {
  const [props, debts] = await Promise.all([listProperties(db, member), listLoans(db, member)])
  const rents = props.length
    ? await linkedRows(
        db,
        member,
        inArray(
          transactions.rentPropertyId,
          props.map((p) => p.id),
        ),
      )
    : []
  return {
    properties: props.map((p) => ({
      row: p,
      minor: convertMinor(p.valueMinor, p.currency, currency, rates),
      rentMonthlyMinor: rentSummary(
        rents.filter((r) => r.rentPropertyId === p.id).map((r) => ({ on: r.on, minor: r.minor })),
        p.valueMinor,
        today(now),
      ).monthlyMinor,
    })),
    loans: debts.map((l) => {
      const v = loanView(l, now)
      return { ...v, minor: convertMinor(v.balanceMinor, l.currency, currency, rates) }
    }),
  }
}

/** A property's value on a day: nothing before it was bought, its typed value after. */
export function propertyValueOn(
  p: Pick<PropertyRow, 'valueMinor' | 'purchasedOn' | 'purchaseMinor' | 'valueOn'>,
  on: string,
): Minor {
  if (p.purchasedOn && on < p.purchasedOn) return 0
  if (on < p.valueOn && p.purchaseMinor !== null && p.purchasedOn) {
    // Between purchase and the typed value, draw a straight line from the price paid.
    const from = Date.parse(p.purchasedOn)
    const to = Date.parse(p.valueOn)
    if (to > from) {
      const share = (Date.parse(on) - from) / (to - from)
      return Math.round(p.purchaseMinor + (p.valueMinor - p.purchaseMinor) * share)
    }
  }
  return p.valueMinor
}

/** A loan's balance on a day, for charts. */
export function loanBalanceOnDay(l: LoanRow, on: string): Minor {
  return loanBalanceOn(terms(l), on)
}
