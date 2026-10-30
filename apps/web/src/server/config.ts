export interface AuthConfig {
  /** Exact origin the browser uses, e.g. https://home.example.com. */
  origin: string
  /** WebAuthn relying party id: the origin's hostname. */
  rpId: string
  rpName: string
  secureCookies: boolean
}

export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:3000').origin
  const url = new URL(origin)
  return {
    origin,
    rpId: url.hostname,
    rpName: 'Hearthside',
    secureCookies: url.protocol === 'https:',
  }
}

export const SESSION_COOKIE = 'hs_session'
export const CHALLENGE_COOKIE = 'hs_challenge'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Extend a session at most once a day, so busy pages don't write on every request. */
export const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
