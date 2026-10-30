import { AuthError } from './repo'
import type { AuthConfig } from './config'

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status)
}

/** Reject cross-site requests. Cookies are SameSite=Lax as well; this is belt and braces. */
export function sameOrigin(request: Request, config: AuthConfig): boolean {
  const origin = request.headers.get('origin')
  return origin === null || origin === config.origin
}

export function clientIp(request: Request): string | null {
  const forwarded =
    request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]
  return forwarded?.trim() || null
}

export async function readJson<T>(request: Request): Promise<T | undefined> {
  try {
    return (await request.json()) as T
  } catch {
    return undefined
  }
}

/** Map known errors to a 4xx with a human message; anything else is a 500 that says nothing. */
export function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    const status = err.code === 'not_allowed' ? 403 : err.code === 'not_found' ? 404 : 409
    return fail(err.message, status)
  }
  console.error(JSON.stringify({ level: 'error', msg: 'auth request failed', error: String(err) }))
  return fail('Something went wrong. Please try again.', 500)
}

export function cleanName(value: unknown, max = 60): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.replace(/\s+/g, ' ').trim()
  return name.length >= 1 && name.length <= max ? name : undefined
}
