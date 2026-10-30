import { migrateDb } from '@hearthside/db'
import { join } from 'node:path'
import { requireDb } from '@/lib/db'

/** Runs once when the server starts. Fails loudly: a half-migrated app must not serve. */
export async function runMigrations() {
  const folder = process.env.MIGRATIONS_DIR ?? join(process.cwd(), '../../packages/db/migrations')
  await migrateDb(requireDb(), folder)
  console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', folder }))
}
