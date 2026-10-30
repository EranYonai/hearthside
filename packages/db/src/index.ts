import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

export type Sql = ReturnType<typeof postgres>

/** One pooled connection per process. Schema and migrations arrive with the first tables. */
export function createDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, { max: options.max ?? 5, idle_timeout: 30, connect_timeout: 5 })
  return { sql, db: drizzle(sql) }
}

export type PingResult = { ok: true; latencyMs: number } | { ok: false; error: string }

/** Round-trip check used by health endpoints. Never throws. */
export async function ping(
  sql: Pick<Sql, 'unsafe'>,
  now: () => number = performance.now.bind(performance),
): Promise<PingResult> {
  const start = now()
  try {
    await sql.unsafe('select 1')
    return { ok: true, latencyMs: Math.round(now() - start) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Resolve the connection URL. In Compose the password comes from a secret file
 * (DATABASE_PASSWORD_FILE) so it never sits in the environment or the image.
 */
export function databaseUrl(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string,
): string | undefined {
  if (!env.DATABASE_URL) return undefined
  if (!env.DATABASE_PASSWORD_FILE) return env.DATABASE_URL
  const url = new URL(env.DATABASE_URL)
  url.password = encodeURIComponent(readFile(env.DATABASE_PASSWORD_FILE).trim())
  return url.toString()
}

type Client = ReturnType<typeof createDb>

/**
 * Holds one client and rebuilds it after a failed ping, re-resolving the URL.
 * That way a database restart or a password rotation recovers without
 * restarting the app.
 */
export function createDbHandle(
  resolveUrl: () => string | undefined,
  factory: (url: string) => Client = createDb,
) {
  let client: Client | undefined

  function get(): Client | undefined {
    if (client) return client
    const url = resolveUrl()
    if (!url) return undefined
    client = factory(url)
    return client
  }

  async function reset(): Promise<void> {
    const old = client
    client = undefined
    await old?.sql.end({ timeout: 0 }).catch(() => {})
  }

  return {
    get,
    reset,
    /** undefined when no database is configured. */
    pinger(): (() => Promise<PingResult>) | undefined {
      const current = get()
      if (!current) return undefined
      return async () => {
        const result = await ping(current.sql)
        if (!result.ok) await reset()
        return result
      }
    },
  }
}
