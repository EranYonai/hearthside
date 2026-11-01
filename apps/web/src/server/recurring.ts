import { findRecurring, type Recurring } from '@hearthside/core'
import { type MemberRow, schema } from '@hearthside/db'
import { and, eq, gte, inArray, isNull } from 'drizzle-orm'
import { canEdit, listAccounts } from './ledger'
import { AuthError } from './repo'

const { recurringDismissals, transactions } = schema

type Conn = Parameters<typeof listAccounts>[0]

/** How far back to look: a little over a year, so yearly payments show up twice. */
const LOOKBACK_DAYS = 400

/**
 * Payments that repeat across the accounts this member can see, largest monthly cost first.
 * Card bills paid from the bank are left out: the purchases on the card are what repeat.
 */
export async function listRecurring(
  db: Conn,
  member: MemberRow,
  now = new Date(),
): Promise<Recurring[]> {
  return (await recurringAndDismissed(db, member, now)).recurring
}

/** Fixed costs, and the ones someone in the household said aren't. */
export async function recurringAndDismissed(db: Conn, member: MemberRow, now = new Date()) {
  const [found, dismissed] = await Promise.all([
    detect(db, member, now),
    db
      .select({ key: recurringDismissals.payeeKey })
      .from(recurringDismissals)
      .where(eq(recurringDismissals.householdId, member.householdId)),
  ])
  const off = new Set(dismissed.map((d) => d.key))
  return {
    recurring: found.filter((r) => !off.has(r.key)),
    dismissed: found.filter((r) => off.has(r.key)),
  }
}

async function detect(db: Conn, member: MemberRow, now: Date): Promise<Recurring[]> {
  const visible = (await listAccounts(db, member)).map((a) => a.id)
  if (!visible.length) return []
  const today = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  const rows = await db
    .select({
      key: transactions.descriptionKey,
      description: transactions.description,
      on: transactions.occurredOn,
      minor: transactions.amountMinor,
      category: transactions.category,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, visible),
        gte(transactions.occurredOn, from),
        isNull(transactions.cardBill),
        eq(transactions.householdId, member.householdId),
      ),
    )
  return findRecurring(rows, today)
}

/** "Not a fixed cost" (or, with `restore`, "it is after all") for a payee, for the whole household. */
export async function setDismissed(db: Conn, member: MemberRow, payeeKey: string, restore = false) {
  if (!canEdit(member)) throw new AuthError('not_allowed', 'Viewers can’t change data')
  if (typeof payeeKey !== 'string' || !payeeKey || payeeKey.length > 200)
    throw new AuthError('not_found', 'Unknown payment')
  if (restore) {
    await db
      .delete(recurringDismissals)
      .where(
        and(
          eq(recurringDismissals.householdId, member.householdId),
          eq(recurringDismissals.payeeKey, payeeKey),
        ),
      )
    return
  }
  await db
    .insert(recurringDismissals)
    .values({ householdId: member.householdId, payeeKey, createdBy: member.id })
    .onConflictDoNothing()
}
