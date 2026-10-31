import { initEncryption, masterKeysFromEnv, migrateDb } from '@hearthside/db'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireDb } from '@/lib/db'

/**
 * Runs once when the server starts. Fails loudly: a half-migrated app, or one without its
 * encryption keys, must not serve.
 */
export async function runMigrations() {
  const folder = process.env.MIGRATIONS_DIR ?? join(process.cwd(), '../../packages/db/migrations')
  const db = requireDb()
  await migrateDb(db, folder)
  console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', folder }))
  const keys = masterKeysFromEnv(process.env, (path) => readFileSync(path, 'utf8'))
  const result = await initEncryption(db, keys)
  console.log(JSON.stringify({ level: 'info', msg: 'encryption ready', ...result }))
}
