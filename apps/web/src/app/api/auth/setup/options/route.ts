import { cleanName, fail, json, readJson } from '@/server/http'
import { getHousehold, saveChallenge } from '@/server/repo'
import { authRoute } from '@/server/route'
import { setChallengeCookie } from '@/server/session'
import { registrationOptions } from '@/server/webauthn'

export const POST = authRoute(async ({ request, db, config }) => {
  const body = await readJson<{ householdName?: unknown; name?: unknown }>(request)
  const householdName = cleanName(body?.householdName)
  const name = cleanName(body?.name)
  if (!householdName || !name) return fail('Add a name for your home and for yourself')
  if (await getHousehold(db)) return fail('This home is already set up', 409)
  const options = await registrationOptions(config, { name })
  const id = await saveChallenge(db, {
    challenge: options.challenge,
    purpose: 'setup',
    payload: { householdName, name },
  })
  await setChallengeCookie(id)
  return json(options)
})
