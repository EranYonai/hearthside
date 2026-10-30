import { clientIp, fail, json, readJson } from '@/server/http'
import { audit, createHousehold, createSession, takeChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setSessionCookie, takeChallengeCookie } from '@/server/session'
import { deviceLabel, verifyRegistration, type RegistrationResponseJSON } from '@/server/webauthn'

export const POST = authRoute(async ({ request, db, config }) => {
  const body = await readJson<{ response?: RegistrationResponseJSON }>(request)
  const challengeId = await takeChallengeCookie()
  const challenge = challengeId && (await takeChallenge(db, challengeId, 'setup'))
  if (!challenge || !body?.response) return fail('That took too long. Please start again.')
  const passkey = await verifyRegistration(
    config,
    body.response,
    challenge.challenge,
    deviceLabel(request.headers.get('user-agent')),
  )
  if (!passkey) return fail('The passkey could not be verified')
  const { householdName, name } = challenge.payload as { householdName: string; name: string }
  const created = await createHousehold(db, { householdName, ownerName: name, passkey })
  await setSessionCookie(await createSession(db, created.member.id))
  await audit(db, {
    householdId: created.household.id,
    memberId: created.member.id,
    action: 'signin',
    detail: { method: 'setup' },
    ip: clientIp(request),
  })
  return json({ recoveryCodes: created.recoveryCodes })
})
