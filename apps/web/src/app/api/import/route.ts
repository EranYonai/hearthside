import {
  ImportFormatError,
  StatementError,
  parseStatement,
  readStatementFile,
} from '@hearthside/core'
import { fail, json } from '@/server/http'
import { commitImport, findBatchByHash, getOwnAccount, prepareImport } from '@/server/ledger'
import { authRoute } from '@/server/route'
import { currentSession } from '@/server/session'
import { sha256 } from '@/server/tokens'

const MAX_BYTES = 10 * 1024 * 1024
const PREVIEW_ROWS = 50

/**
 * POST multipart: accountId, file, flip ("1" to reverse signs), commit ("1" to save).
 * Without commit it only previews. The file is parsed in memory and never stored.
 */
export const POST = authRoute(async ({ request, db }) => {
  const session = await currentSession()
  if (!session || session.session.viaRecovery) return fail('Please sign in again', 401)
  const { member } = session

  const form = await request.formData().catch(() => undefined)
  const file = form?.get('file')
  const accountId = form?.get('accountId')
  if (!(file instanceof File) || typeof accountId !== 'string')
    return fail('Choose an account and a file')
  if (file.size === 0) return fail('That file is empty')
  if (file.size > MAX_BYTES) return fail('Files up to 10 MB, please')

  const account = await getOwnAccount(db, member, accountId)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileHash = sha256(Buffer.from(bytes).toString('base64'))
  const flip = form?.get('flip') === '1'
  const spendingIsPositive = (account.kind === 'card') !== flip

  let parsed
  try {
    parsed = parseStatement(await readStatementFile(bytes, file.name), { spendingIsPositive })
  } catch (err) {
    if (err instanceof ImportFormatError || err instanceof StatementError)
      return fail(err.message, 422)
    throw err
  }
  const rows = await prepareImport(db, account, parsed.transactions)
  const fresh = rows.filter((r) => !r.duplicate).length

  if (form?.get('commit') === '1') {
    const batch = await commitImport(db, member, account, {
      fileName: file.name,
      fileHash,
      rows,
      skipped: parsed.skipped.length,
    })
    const latest = rows.reduce((m, r) => (r.occurredOn > m ? r.occurredOn : m), '')
    return json({ batch, month: latest.slice(0, 7) || null })
  }

  const previous = await findBatchByHash(db, account.id, fileHash)
  return json({
    total: rows.length,
    fresh,
    duplicates: rows.length - fresh,
    skipped: parsed.skipped.slice(0, 20),
    skippedCount: parsed.skipped.length,
    tables: parsed.tables.map((t) => ({
      sheet: t.sheet,
      headerRow: t.headerRow,
      columns: t.columns,
      headers: t.headers,
    })),
    alreadyImported: previous ? previous.createdAt : null,
    sample: rows.slice(0, PREVIEW_ROWS).map((r) => ({
      occurredOn: r.occurredOn,
      description: r.description,
      amountMinor: r.amountMinor,
      original: r.original ?? null,
      installment: r.installment ?? null,
      duplicate: r.duplicate,
    })),
  })
})
