import type { PingResult } from '@hearthside/db'

export interface Health {
  status: 'ok' | 'degraded'
  version: string
  commit: string
  db: 'ok' | 'down' | 'not_configured'
}

/** Public health shape. Errors stay in the logs, never in the response. */
export async function checkHealth(
  pingDb: (() => Promise<PingResult>) | undefined,
  { version, commit }: { version: string; commit: string },
): Promise<Health> {
  if (!pingDb) return { status: 'ok', version, commit, db: 'not_configured' }
  const result = await pingDb()
  if (!result.ok)
    console.error(JSON.stringify({ level: 'error', msg: 'db ping failed', error: result.error }))
  return { status: result.ok ? 'ok' : 'degraded', version, commit, db: result.ok ? 'ok' : 'down' }
}
