import { clientIp, fail, json, readJson } from '@/server/http'
import { audit, countRecent, createSession, redeemRecoveryCode } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setSessionCookie } from '@/server/session'

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_IP = 5
const MAX_GLOBAL = 20

export const POST = authRoute(async ({ request, db }) => {
  const ip = clientIp(request)
  const since = new Date(Date.now() - WINDOW_MS)
  if (
    (await countRecent(db, 'recovery.failed', since, ip ?? undefined)) >= MAX_PER_IP ||
    (await countRecent(db, 'recovery.failed', since)) >= MAX_GLOBAL
  ) {
    return fail('Too many attempts. Wait 15 minutes and try again.', 429)
  }
  const body = await readJson<{ code?: unknown }>(request)
  const member =
    typeof body?.code === 'string' ? await redeemRecoveryCode(db, body.code) : undefined
  if (!member) {
    await audit(db, { action: 'recovery.failed', ip })
    return fail('That code didn’t work. Check it and try again.', 401)
  }
  await setSessionCookie(await createSession(db, member.id, { viaRecovery: true }))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: 'recovery.used',
    ip,
  })
  return json({ ok: true })
})
