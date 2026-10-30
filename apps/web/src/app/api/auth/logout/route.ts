import { clientIp, json } from '@/server/http'
import { audit, deleteSession } from '@/server/repo'
import { authRoute } from '@/server/route'
import { clearSessionCookie, currentSession, sessionToken } from '@/server/session'

export const POST = authRoute(async ({ request, db }) => {
  const session = await currentSession()
  const token = await sessionToken()
  if (token) await deleteSession(db, token)
  await clearSessionCookie()
  if (session) {
    await audit(db, {
      householdId: session.member.householdId,
      memberId: session.member.id,
      action: 'signout',
      ip: clientIp(request),
    })
  }
  return json({ ok: true })
})
