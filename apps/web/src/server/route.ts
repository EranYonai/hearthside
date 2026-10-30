import 'server-only'
import { requireDb } from '@/lib/db'
import { authConfig, type AuthConfig } from './config'
import { errorResponse, fail, sameOrigin } from './http'

type Ctx = { request: Request; db: ReturnType<typeof requireDb>; config: AuthConfig }

/** Wraps an auth route: same-origin check, database, and safe error responses. */
export function authRoute(handler: (ctx: Ctx) => Promise<Response>) {
  return async (request: Request) => {
    const config = authConfig()
    if (!sameOrigin(request, config)) return fail('Cross-site request refused', 403)
    try {
      return await handler({ request, db: requireDb(), config })
    } catch (err) {
      return errorResponse(err)
    }
  }
}
