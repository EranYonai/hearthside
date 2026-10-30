import { json } from '@/server/http'
import { saveChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setChallengeCookie } from '@/server/session'
import { authenticationOptions } from '@/server/webauthn'

export const POST = authRoute(async ({ db, config }) => {
  const options = await authenticationOptions(config)
  await setChallengeCookie(
    await saveChallenge(db, { challenge: options.challenge, purpose: 'login' }),
  )
  return json(options)
})
