import {
  BROKERS,
  detectBroker,
  mainCurrency,
  matchInvestmentAccount,
  suggestInvestmentName,
  type DetectedBroker,
  type HoldingsFile,
  type Sheet,
} from '@hearthside/core'
import type { Db, InvestmentAccountRow, MemberRow } from '@hearthside/db'
import {
  createInvestmentAccount,
  getVisibleInvestmentAccount,
  importHoldings,
  listInvestmentAccounts,
  mayManage,
} from './invest'
import { AuthError } from './repo'

export interface HoldingsPlan {
  /** The account the holdings go into, or null when a new one is proposed. */
  account: InvestmentAccountRow | null
  proposed: { name: string; provider: string | null; currency: string }
  detected: DetectedBroker
  file: HoldingsFile
}

/**
 * Pick the investment account a holdings file belongs to: the one asked for, or a
 * matching one (same broker, and the same account number when the file shows it), or a
 * new account named after the broker.
 */
export async function planHoldingsImport(
  db: Db,
  member: MemberRow,
  sheets: readonly Sheet[],
  file: HoldingsFile,
  fileName: string,
  accountId?: string,
): Promise<HoldingsPlan> {
  const detected = detectBroker(sheets, file, fileName)
  const proposed = {
    name: suggestInvestmentName(detected),
    provider: detected.broker ? BROKERS[detected.broker].label : null,
    currency: mainCurrency(file),
  }
  if (accountId) {
    const account = await getVisibleInvestmentAccount(db, member, accountId)
    if (!mayManage(member, account))
      throw new AuthError('not_allowed', 'Only the person whose account this is can change it')
    return { account, proposed, detected, file }
  }
  const mine = (await listInvestmentAccounts(db, member)).filter((a) => mayManage(member, a))
  const account = matchInvestmentAccount(mine, detected) ?? null
  return { account, proposed, detected, file }
}

/** Create the proposed account if needed, then bring its holdings in line with the file. */
export async function commitHoldingsPlan(
  db: Db,
  member: MemberRow,
  plan: HoldingsPlan,
  options: { removeMissing: boolean; holderId?: string | null },
) {
  const rows = plan.file.holdings.map((h) => ({ ...h, price: h.price ?? undefined }))
  if (rows.length === 0 || rows.length > 500)
    throw new AuthError('not_allowed', 'A file can have 1 to 500 holdings')
  const account =
    plan.account ??
    (await createInvestmentAccount(db, member, {
      ...plan.proposed,
      visibility: 'household',
      holderId: options.holderId ?? undefined,
    }))
  const result = await importHoldings(db, member, account.id, rows, {
    removeMissing: options.removeMissing,
  })
  return { ...result, account }
}
