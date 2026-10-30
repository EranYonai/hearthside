import 'server-only'
import { readFileSync } from 'node:fs'
import { createDb, databaseUrl, ping } from '@hearthside/db'

let client: ReturnType<typeof createDb> | undefined

/** Lazily created so builds and pages that don't need the database never connect. */
export function getDb() {
  const url = databaseUrl(process.env, (path) => readFileSync(path, 'utf8'))
  if (!url) return undefined
  client ??= createDb(url)
  return client
}

export function dbPinger() {
  const db = getDb()
  return db ? () => ping(db.sql) : undefined
}
