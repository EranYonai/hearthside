import { cleanName, fail, json, readJson } from '@/server/http'
import { findOpenInvite, saveChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setChallengeCookie } from '@/server/session'
import { registrationOptions } from '@/server/webauthn'

export const POST = authRoute(async ({ request, db, config }) => {
  const body = await readJson<{ token?: unknown; name?: unknown }>(request)
  const name = cleanName(body?.name)
  const token = typeof body?.token === 'string' ? body.token : undefined
  if (!name || !token) return fail('Add your name to continue')
  if (!(await findOpenInvite(db, token))) return fail('This invite link is no longer valid', 410)
  const options = await registrationOptions(config, { name })
  await setChallengeCookie(
    await saveChallenge(db, {
      challenge: options.challenge,
      purpose: 'invite',
      payload: { token, name },
    }),
  )
  return json(options)
})
