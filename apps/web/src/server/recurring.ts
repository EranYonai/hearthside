import { findRecurring, type Recurring } from '@hearthside/core'
import { type MemberRow, schema } from '@hearthside/db'
import { and, eq, gte, inArray, isNull } from 'drizzle-orm'
import { listAccounts } from './ledger'

const { transactions } = schema

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
