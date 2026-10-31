import {
  ImportFormatError,
  StatementError,
  UnknownFileError,
  classifyImport,
  detectSource,
  parseHoldings,
  parseStatement,
  readStatementFile,
  type Sheet,
} from '@hearthside/core'
import type { Db, MemberRow } from '@hearthside/db'
import { after } from 'next/server'
import { scheduleCategorize } from '@/server/categorize'
import { commitHoldingsPlan, planHoldingsImport, type HoldingsPlan } from '@/server/holdings-plan'
import { fail, json } from '@/server/http'
import {
  commitPlan,
  findBatchByHash,
  getOwnAccount,
  planImport,
  type ImportGroup,
} from '@/server/ledger'
import { isApproved } from '@/server/repo'
import { authRoute } from '@/server/route'
import { currentSession } from '@/server/session'
import { sha256 } from '@/server/tokens'

const MAX_BYTES = 10 * 1024 * 1024
const PREVIEW_ROWS = 50

function describe(g: ImportGroup) {
  const fresh = g.rows.filter((r) => !r.duplicate).length
  return {
    account: g.account
      ? { id: g.account.id, name: g.account.name, isNew: false }
      : { id: null, name: g.proposed.name, isNew: true },
    kind: g.account?.kind ?? g.proposed.kind,
    provider: g.account?.provider ?? g.proposed.provider,
    color: g.account?.color ?? null,
    network: g.account?.network ?? g.proposed.network,
    last4: g.account?.last4 ?? g.proposed.last4,
    total: g.rows.length,
    fresh,
    duplicates: g.rows.length - fresh,
    sample: g.rows.slice(0, PREVIEW_ROWS).map((r) => ({
      occurredOn: r.occurredOn,
      description: r.description,
      amountMinor: r.amountMinor,
      original: r.original ?? null,
      installment: r.installment ?? null,
      duplicate: r.duplicate,
    })),
  }
}

/**
 * POST multipart: file, optionally accountId (otherwise the account is detected) and
 * commit ("1" saves). Without commit it only previews. Card statements list purchases as
 * positive numbers, so for cards those become money out.
 * The file is parsed in memory and never stored.
 */
export const POST = authRoute(async ({ request, db }) => {
  const session = await currentSession()
  if (!session || session.session.viaRecovery) return fail('Please sign in again', 401)
  if (!isApproved(session.member)) return fail('Waiting for the owner to approve you', 403)
  const { member } = session

  const form = await request.formData().catch(() => undefined)
  const file = form?.get('file')
  if (!(file instanceof File)) return fail('Choose a file to import')
  if (file.size === 0) return fail('That file is empty')
  if (file.size > MAX_BYTES) return fail('Files up to 10 MB, please')
  const accountIdValue = form?.get('accountId')
  const accountId =
    typeof accountIdValue === 'string' && accountIdValue ? accountIdValue : undefined
  const holderValue = form?.get('holderId')
  const holderId = typeof holderValue === 'string' && holderValue ? holderValue : null

  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileHash = sha256(Buffer.from(bytes).toString('base64'))

  let sheets
  let parsed
  let source
  try {
    sheets = await readStatementFile(bytes, file.name)
    // Read once to tell statements from holdings and find the tables, then read with the
    // right signs.
    const kind = classifyImport(sheets)
    if (kind.type === 'holdings')
      return await holdings(db, member, form!, sheets, kind.holdings, file.name, accountId)
    source = detectSource(sheets, kind.probe, file.name)
    const accountKind = accountId ? (await getOwnAccount(db, member, accountId)).kind : source.kind
    parsed = parseStatement(sheets, { spendingIsPositive: accountKind === 'card' })
  } catch (err) {
    if (
      err instanceof ImportFormatError ||
      err instanceof StatementError ||
      err instanceof UnknownFileError
    )
      return fail(err.message, 422)
    throw err
  }

  const groups = await planImport(db, member, source, parsed.transactions, accountId)

  if (form?.get('commit') === '1') {
    const results = await commitPlan(db, member, groups, {
      fileName: file.name,
      fileHash,
      skipped: parsed.skipped.length,
      holderId,
    })
    // The model is slow; answer now and let it file the rest.
    after(() => scheduleCategorize(db, member.householdId))
    const latest = parsed.transactions.reduce((m, r) => (r.occurredOn > m ? r.occurredOn : m), '')
    return json({
      type: 'statement',
      added: results.reduce((n, r) => n + r.batch.added, 0),
      duplicates: results.reduce((n, r) => n + r.batch.duplicates, 0),
      accounts: results.map((r) => r.account.name),
      month: latest.slice(0, 7) || null,
    })
  }

  const previous = await Promise.all(
    groups.map((g) => (g.account ? findBatchByHash(db, g.account.id, fileHash) : undefined)),
  )
  const already = previous.find(Boolean)
  return json({
    type: 'statement',
    fileName: file.name,
    groups: groups.map(describe),
    skipped: parsed.skipped.slice(0, 20),
    skippedCount: parsed.skipped.length,
    alreadyImported: already ? already.createdAt : null,
  })
})

/** The holdings half of the import: preview, or with commit, bring the account in line. */
async function holdings(
  db: Db,
  member: MemberRow,
  form: FormData,
  sheets: Sheet[],
  file: HoldingsPlan['file'],
  fileName: string,
  accountId: string | undefined,
) {
  let plan = await planHoldingsImport(db, member, sheets, file, fileName, accountId)
  // Rows without a currency are in the account's own currency.
  const currency = plan.account?.currency ?? plan.proposed.currency
  if (currency !== 'ILS') plan = { ...plan, file: parseHoldings(sheets, currency) }

  if (form.get('commit') === '1') {
    const holder = form.get('holderId')
    const result = await commitHoldingsPlan(db, member, plan, {
      removeMissing: form.get('removeMissing') !== '0',
      holderId: typeof holder === 'string' && holder ? holder : null,
    })
    return json({
      type: 'holdings',
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      account: { id: result.account.id, name: result.account.name },
    })
  }
  return json({
    type: 'holdings',
    fileName,
    account: plan.account
      ? { id: plan.account.id, name: plan.account.name, isNew: false }
      : { id: null, name: plan.proposed.name, isNew: true },
    provider: plan.account?.provider ?? plan.proposed.provider,
    currency,
    holdings: plan.file.holdings.slice(0, PREVIEW_ROWS),
    total: plan.file.holdings.length,
    skipped: plan.file.skipped.slice(0, 20),
    skippedCount: plan.file.skipped.length,
    priceInHundredths: plan.file.priceInHundredths,
  })
}
