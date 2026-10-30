import { fail, json } from '@/server/http'
import { listPasskeys, saveChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { currentSession, setChallengeCookie } from '@/server/session'
import { registrationOptions } from '@/server/webauthn'

export const POST = authRoute(async ({ db, config }) => {
  const session = await currentSession()
  if (!session) return fail('Please sign in again', 401)
  const { member } = session
  const existing = await listPasskeys(db, member.id)
  const options = await registrationOptions(config, { id: member.id, name: member.name }, existing)
  await setChallengeCookie(
    await saveChallenge(db, {
      challenge: options.challenge,
      purpose: 'add-passkey',
      payload: { memberId: member.id },
    }),
  )
  return json(options)
})
