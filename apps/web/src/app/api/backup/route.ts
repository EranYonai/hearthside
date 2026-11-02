import { readFileSync } from 'node:fs'
import { BACKUP_DOWNLOADED, fetchBackup } from '@/server/backups'
import { clientIp, fail } from '@/server/http'
import { audit, isApproved } from '@/server/repo'
import { authRoute } from '@/server/route'
import { currentSession } from '@/server/session'

export const dynamic = 'force-dynamic'

function serviceToken(): string {
  const file = process.env.DATABASE_PASSWORD_FILE
  try {
    return file ? readFileSync(file, 'utf8').trim() : ''
  } catch {
    return ''
  }
}

/**
 * The owner downloads a fresh encrypted backup. It is made on the spot and passed
 * straight through; the server keeps no copy.
 */
export const POST = authRoute(async ({ request, db }) => {
  const session = await currentSession()
  if (!session || session.session.viaRecovery) return fail('Please sign in again', 401)
  const { member } = session
  if (!isApproved(member) || member.role !== 'owner')
    return fail('Only the owner can download backups', 403)

  const result = await fetchBackup(process.env.BACKUP_URL, serviceToken())
  if (!result.ok) return fail(result.error, 502)

  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: BACKUP_DOWNLOADED,
    detail: { bytes: result.data.byteLength },
    ip: clientIp(request),
  })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  return new Response(result.data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="hearthside-${stamp}.dump.age"`,
      'Cache-Control': 'no-store',
    },
  })
})
