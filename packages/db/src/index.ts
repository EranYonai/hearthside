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
