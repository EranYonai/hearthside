import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { requireDb } from '@/lib/db'
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  authConfig,
} from './config'
import { getSession } from './repo'

function cookieBase() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: authConfig().secureCookies, path: '/' }
}

export async function setSessionCookie(token: string) {
  ;(await cookies()).set(SESSION_COOKIE, token, { ...cookieBase(), maxAge: SESSION_TTL_MS / 1000 })
}

export async function clearSessionCookie() {
  ;(await cookies()).delete(SESSION_COOKIE)
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

export async function setChallengeCookie(id: string) {
  ;(await cookies()).set(CHALLENGE_COOKIE, id, { ...cookieBase(), maxAge: CHALLENGE_TTL_MS / 1000 })
}

/** Reads and clears the challenge cookie. */
export async function takeChallengeCookie() {
  const store = await cookies()
  const id = store.get(CHALLENGE_COOKIE)?.value
  store.delete(CHALLENGE_COOKIE)
  return id
}

/** The signed-in member for this request, if any. Cached per request. */
export const currentSession = cache(async () => {
  const token = await sessionToken()
  if (!token) return undefined
  return getSession(requireDb(), token)
})

/**
 * For pages that need a signed-in member. A session that came from a recovery code
 * can only reach the "add a passkey" page until it adds one.
 */
export async function requireSession(options: { allowRecovery?: boolean } = {}) {
  const session = await currentSession()
  if (!session) redirect('/login')
  if (session.session.viaRecovery && !options.allowRecovery) redirect('/recovered')
  return session
}
