import { cleanEmail, RateLimited, requestInvite } from '@/server/app-invites'
import { clientIp, fail, json, readJson } from '@/server/http'
import { authRoute } from '@/server/route'

/** "Request an invite" on the public page. Same answer whether or not the address asked before. */
export const POST = authRoute(async ({ request, db }) => {
  const body = await readJson<{ email?: unknown }>(request)
  const email = cleanEmail(body?.email)
  if (!email) return fail('Enter an email address')
  try {
    await requestInvite(db, email, clientIp(request))
  } catch (err) {
    if (err instanceof RateLimited) return fail(err.message, 429)
    throw err
  }
  return json({ ok: true })
})
