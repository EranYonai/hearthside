import { fail, json, readJson } from '@/server/http'
import { addPasskey, clearRecoveryFlag, takeChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { currentSession, sessionToken, takeChallengeCookie } from '@/server/session'
import { deviceLabel, verifyRegistration, type RegistrationResponseJSON } from '@/server/webauthn'

export const POST = authRoute(async ({ request, db, config }) => {
  const session = await currentSession()
  if (!session) return fail('Please sign in again', 401)
  const body = await readJson<{ response?: RegistrationResponseJSON }>(request)
  const challengeId = await takeChallengeCookie()
  const challenge = challengeId && (await takeChallenge(db, challengeId, 'add-passkey'))
  if (!challenge || challenge.payload.memberId !== session.member.id || !body?.response) {
    return fail('That took too long. Please try again.')
  }
  const passkey = await verifyRegistration(
    config,
    body.response,
    challenge.challenge,
    deviceLabel(request.headers.get('user-agent')),
  )
  if (!passkey) return fail('The passkey could not be verified')
  await addPasskey(db, session.member, passkey)
  const token = await sessionToken()
  if (token && session.session.viaRecovery) await clearRecoveryFlag(db, token)
  return json({ ok: true })
})
