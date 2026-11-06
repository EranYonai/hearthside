import { findOpenAppInvite } from '@/server/app-invites'
import { cleanName, fail, json, readJson } from '@/server/http'
import { saveChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setChallengeCookie } from '@/server/session'
import { registrationOptions } from '@/server/webauthn'

/** A friend invite: the person creates their own, separate home. */
export const POST = authRoute(async ({ request, db, config }) => {
  const body = await readJson<{ token?: unknown; householdName?: unknown; name?: unknown }>(request)
  const householdName = cleanName(body?.householdName)
  const name = cleanName(body?.name)
  const token = typeof body?.token === 'string' ? body.token : undefined
  if (!householdName || !name || !token) return fail('Add a name for your home and for yourself')
  if (!(await findOpenAppInvite(db, token))) return fail('This invite link is no longer valid', 410)
  const options = await registrationOptions(config, { name })
  const id = await saveChallenge(db, {
    challenge: options.challenge,
    purpose: 'join',
    payload: { token, householdName, name },
  })
  await setChallengeCookie(id)
  return json(options)
})
