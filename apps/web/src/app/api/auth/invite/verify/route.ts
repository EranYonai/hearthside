import { clientIp, fail, json, readJson } from '@/server/http'
import { acceptInvite, audit, createSession, takeChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setSessionCookie, takeChallengeCookie } from '@/server/session'
import { deviceLabel, verifyRegistration, type RegistrationResponseJSON } from '@/server/webauthn'

export const POST = authRoute(async ({ request, db, config }) => {
  const body = await readJson<{ response?: RegistrationResponseJSON }>(request)
  const challengeId = await takeChallengeCookie()
  const challenge = challengeId && (await takeChallenge(db, challengeId, 'invite'))
  if (!challenge || !body?.response) return fail('That took too long. Please start again.')
  const passkey = await verifyRegistration(
    config,
    body.response,
    challenge.challenge,
    deviceLabel(request.headers.get('user-agent')),
  )
  if (!passkey) return fail('The passkey could not be verified')
  const { token, name } = challenge.payload as { token: string; name: string }
  const joined = await acceptInvite(db, { token, name, passkey })
  await setSessionCookie(await createSession(db, joined.member.id))
  await audit(db, {
    householdId: joined.member.householdId,
    memberId: joined.member.id,
    action: 'signin',
    detail: { method: 'invite' },
    ip: clientIp(request),
  })
  return json({ recoveryCodes: joined.recoveryCodes })
})
