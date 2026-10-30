import { clientIp, fail, json, readJson } from '@/server/http'
import { audit, createSession, findPasskey, markPasskeyUsed, takeChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setSessionCookie, takeChallengeCookie } from '@/server/session'
import { verifyAuthentication, type AuthenticationResponseJSON } from '@/server/webauthn'

const NOT_RECOGNISED = 'That passkey isn’t recognised here'

export const POST = authRoute(async ({ request, db, config }) => {
  const body = await readJson<{ response?: AuthenticationResponseJSON }>(request)
  const challengeId = await takeChallengeCookie()
  const challenge = challengeId && (await takeChallenge(db, challengeId, 'login'))
  if (!challenge || !body?.response?.id) return fail('That took too long. Please try again.')
  const found = await findPasskey(db, body.response.id)
  if (!found) {
    await audit(db, {
      action: 'signin.failed',
      detail: { reason: 'unknown_passkey' },
      ip: clientIp(request),
    })
    return fail(NOT_RECOGNISED, 401)
  }
  const counter = await verifyAuthentication(
    config,
    body.response,
    challenge.challenge,
    found.passkey,
  )
  if (counter === undefined) {
    await audit(db, {
      householdId: found.member.householdId,
      memberId: found.member.id,
      action: 'signin.failed',
      ip: clientIp(request),
    })
    return fail(NOT_RECOGNISED, 401)
  }
  await markPasskeyUsed(db, found.passkey.id, counter)
  await setSessionCookie(await createSession(db, found.member.id))
  await audit(db, {
    householdId: found.member.householdId,
    memberId: found.member.id,
    action: 'signin',
    detail: { method: 'passkey' },
    ip: clientIp(request),
  })
  return json({ ok: true })
})
