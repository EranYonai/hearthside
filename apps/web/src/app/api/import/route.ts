import {
  ImportFormatError,
  StatementError,
  detectSource,
  parseStatement,
  providerLabel,
  readStatementFile,
} from '@hearthside/core'
import { fail, json } from '@/server/http'
import {
  commitPlan,
  findBatchByHash,
  getOwnAccount,
  planImport,
  type ImportGroup,
} from '@/server/ledger'
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
    provider: providerLabel(g.account?.provider ?? g.proposed.provider),
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
    // Read once to find the tables, detect the source, then read with the right signs.
    const probe = parseStatement(sheets, { spendingIsPositive: true })
    source = detectSource(sheets, probe, file.name)
    const kind = accountId ? (await getOwnAccount(db, member, accountId)).kind : source.kind
    parsed = parseStatement(sheets, { spendingIsPositive: kind === 'card' })
  } catch (err) {
    if (err instanceof ImportFormatError || err instanceof StatementError)
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
    const latest = parsed.transactions.reduce((m, r) => (r.occurredOn > m ? r.occurredOn : m), '')
    return json({
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
    fileName: file.name,
    groups: groups.map(describe),
    skipped: parsed.skipped.slice(0, 20),
    skippedCount: parsed.skipped.length,
    alreadyImported: already ? already.createdAt : null,
  })
})
