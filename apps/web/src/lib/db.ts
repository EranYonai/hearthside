import 'server-only'
import { readFileSync } from 'node:fs'
import { createDbHandle, databaseUrl } from '@hearthside/db'

// Created lazily, so builds and pages that don't need the database never connect.
// The URL (and the password file) is re-read whenever the client is rebuilt.
const handle = createDbHandle(() => databaseUrl(process.env, (path) => readFileSync(path, 'utf8')))

export const getDb = handle.get
export const dbPinger = handle.pinger

/** For code paths that can't work without a database. */
export function requireDb() {
  const client = handle.get()
  if (!client) throw new Error('DATABASE_URL is not set')
  return client.db
}
