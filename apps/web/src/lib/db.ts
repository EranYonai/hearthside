import 'server-only'
import { readFileSync } from 'node:fs'
import { createDbHandle, databaseUrl } from '@hearthside/db'

// Created lazily, so builds and pages that don't need the database never connect.
// The URL (and the password file) is re-read whenever the client is rebuilt.
const handle = createDbHandle(() => databaseUrl(process.env, (path) => readFileSync(path, 'utf8')))

export const getDb = handle.get
export const dbPinger = handle.pinger
