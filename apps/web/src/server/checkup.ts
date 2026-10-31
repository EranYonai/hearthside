import {
  checkup,
  type CheckupItem,
  cleanInvestSettings,
  convertMinor,
  investSettings,
  type InvestSettings,
  InvestSettingsError,
  type Rates,
} from '@hearthside/core'
import { type Db, type MemberRow, schema } from '@hearthside/db'
import { eq } from 'drizzle-orm'
import { portfolio } from './invest'
import { canEdit, listMonths, totals } from './ledger'
import { audit, AuthError, type Tx } from './repo'
import { dayOf, listMovements } from './trends'

const { households } = schema

type Conn = Db | Tx

/** Statements are in shekels. */
const LEDGER_CURRENCY = 'ILS'

export async function getInvestSettings(db: Conn, householdId: string): Promise<InvestSettings> {
  const [row] = await db
    .select({ settings: households.investSettings })
    .from(households)
    .where(eq(households.id, householdId))
  return investSettings(row?.settings)
}

/** Owners and adults set the household's investing preferences. */
export async function saveInvestSettings(
  db: Conn,
  member: MemberRow,
  input: Parameters<typeof cleanInvestSettings>[0],
): Promise<InvestSettings> {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change this')
  let settings: InvestSettings
  try {
    settings = cleanInvestSettings(input)
  } catch (err) {
    if (err instanceof InvestSettingsError) throw new AuthError('not_allowed', err.message)
    throw err
  }
  await db
    .update(households)
    .set({ investSettings: settings })
    .where(eq(households.id, member.householdId))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'invest_settings.update',
  })
  return settings
}

/** Average money out over the last three full months with statements, or null. */
async function monthlySpend(db: Conn, member: MemberRow, today: string): Promise<number | null> {
  const thisMonth = today.slice(0, 7)
  const months = (await listMonths(db, member)).filter((m) => m < thisMonth).slice(0, 3)
  if (months.length === 0) return null
  const spent = await Promise.all(
    months.map(async (month) => (await totals(db, member, { month })).spent),
  )
  return Math.round(-spent.reduce((n, s) => n + s, 0) / months.length)
}

export interface Checkup {
  settings: InvestSettings
  currency: string
  items: CheckupItem[]
}

/** The check-up for what this member can see, in their display currency. */
export async function runCheckup(
  db: Conn,
  member: MemberRow,
  rates: Rates,
  now = new Date(),
): Promise<Checkup> {
  const today = dayOf(now)
  const currency = member.displayCurrency
  const [settings, { holdings, summary }, spend, movements] = await Promise.all([
    getInvestSettings(db, member.householdId),
    portfolio(db, member, rates),
    monthlySpend(db, member, today),
    listMovements(db, member),
  ])
  const securities = holdings.filter((h) => h.kind === 'security')
  const fees = securities.flatMap((h) =>
    h.facts?.fee ? [{ name: h.name, fee: Number(h.facts.fee) }] : [],
  )
  const items = settings.checkupOn
    ? checkup({
        settings,
        byClass: summary.byClass,
        fees,
        securities: new Set(securities.map((h) => h.instrumentId)).size,
        cashMinor: summary.byClass.cash ?? 0,
        monthlySpendMinor:
          spend === null ? null : convertMinor(spend, LEDGER_CURRENCY, currency, rates),
        depositDays: movements.filter((m) => m.kind === 'deposit').map((m) => m.on),
        today,
      })
    : []
  const missing = Object.keys(summary.unconverted)
  if (missing.length > 0)
    for (const item of items)
      if (item.key === 'split' || item.key === 'home')
        item.detail += ` Holdings in ${missing.join(', ')} are left out until there’s an exchange rate.`
  return { settings, currency, items }
}
