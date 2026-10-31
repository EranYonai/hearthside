import { sql } from 'drizzle-orm'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { newKey, setKeyring } from './crypto'
import { createDb, initEncryption, migrateDb, schema } from './index'
import { masterKeysFromEnv } from './keys'

const url = process.env.TEST_DATABASE_URL
const client = url ? createDb(url, { max: 2 }) : undefined
const db = client?.db as NonNullable<typeof client>['db']
const migrations = join(import.meta.dirname, '../migrations')

/** Migrate up to the schema before encryption and add plaintext rows, as an old install had. */
async function legacyInstall() {
  await db.execute(
    sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public`,
  )
  const { readMigrationFiles } = await import('drizzle-orm/migrator')
  const all = readMigrationFiles({ migrationsFolder: migrations })
  const before = all.findIndex((m) => m.sql.join('').includes('encryption_keys'))
  for (const m of all.slice(0, before)) for (const stmt of m.sql) await db.execute(sql.raw(stmt))
  await db.execute(
    sql.raw(`
    insert into households (id, name) values ('00000000-0000-4000-8000-000000000001', 'Our home');
    insert into members (id, household_id, name, role) values
      ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Alex', 'owner');
    insert into accounts (id, household_id, owner_id, name, kind, provider, last4) values
      ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000002', 'Alex card', 'card', 'demo', '1234');
    insert into transactions (household_id, account_id, occurred_on, description, description_key, amount_minor, dedup_key) values
      ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', '2026-10-01', 'Coffee', 'coffee', -1800, 'abc');
    insert into category_rules (household_id, match, category) values
      ('00000000-0000-4000-8000-000000000001', 'coffee', 'eating-out');
    insert into audit_log (household_id, action, detail, ip) values
      ('00000000-0000-4000-8000-000000000001', 'test', '{"name":"Phone"}', '192.0.2.1');
  `),
  )
  // The rest of the migrations, recorded so migrateDb() picks up from here.
  await db.execute(sql`create schema if not exists drizzle`)
  await db.execute(
    sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
  )
  for (const m of all.slice(0, before))
    await db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`,
    )
  await migrateDb(db, migrations)
}

async function raw(query: string) {
  return (await db.execute(sql.raw(query))) as unknown as Record<string, string | null>[]
}

describe.skipIf(!url)('encryption at rest (Postgres)', () => {
  beforeEach(async () => {
    setKeyring(undefined)
    await legacyInstall()
  })

  afterAll(async () => {
    setKeyring(undefined)
    await client?.sql.end()
  })

  it('encrypts rows written before encryption and still reads them', async () => {
    const master = newKey()
    const result = await initEncryption(db, [master])
    expect(result.encrypted).toBeGreaterThan(0)
    expect(result.newDataKey).toBe(true)

    const dump = JSON.stringify(
      await Promise.all(
        ['households', 'members', 'accounts', 'transactions', 'category_rules', 'audit_log'].map(
          (t) => raw(`select * from ${t}`),
        ),
      ),
    )
    for (const secret of [
      'Our home',
      'Alex',
      '1234',
      'Coffee',
      'coffee',
      '-1800',
      '192.0.2.1',
      'Phone',
    ])
      expect(dump).not.toContain(secret)

    const [t] = await db.select().from(schema.transactions)
    expect(t).toMatchObject({ description: 'Coffee', amountMinor: -1800 })
    const [a] = await db.select().from(schema.accounts)
    expect(a).toMatchObject({ name: 'Alex card', provider: 'demo', last4: '1234' })
    const [entry] = await db.select().from(schema.auditLog)
    expect(entry).toMatchObject({ detail: { name: 'Phone' }, ip: '192.0.2.1' })

    // Lookup columns now hold keyed hashes that match each other.
    const [rule] = await raw('select match from category_rules')
    const [tx] = await raw('select description_key from transactions')
    expect(rule!.match).toMatch(/^hb1:/)
    expect(rule!.match).toBe(tx!.description_key)

    // A second start has nothing left to do.
    expect((await initEncryption(db, [master])).encrypted).toBe(0)
  })

  it('rotates the master key and moves rows to a new data key', async () => {
    const oldMaster = newKey()
    const first = await initEncryption(db, [oldMaster])
    const [before] = await raw('select description_key from transactions')

    await expect(initEncryption(db, [newKey()])).rejects.toThrow("isn't in the key file")

    const newMaster = newKey()
    const rotated = await initEncryption(db, [newMaster, oldMaster])
    expect(rotated.rewrapped).toBe(2)
    expect(rotated.newDataKey).toBe(true)
    expect(rotated.activeKeyId).not.toBe(first.activeKeyId)
    expect(rotated.encrypted).toBeGreaterThan(0)
    const [desc] = await raw('select description from transactions')
    expect(desc!.description).toMatch(new RegExp(`^hs1:${rotated.activeKeyId}:`))
    // Blind indexes are unchanged, so lookups keep working without a rebuild.
    const [after] = await raw('select description_key from transactions')
    expect(after).toEqual(before)

    // The old master key can now be dropped from the file.
    const again = await initEncryption(db, [newMaster])
    expect(again).toMatchObject({ rewrapped: 0, newDataKey: false, encrypted: 0 })
    const [t] = await db.select().from(schema.transactions)
    expect(t!.description).toBe('Coffee')
    const keys = await raw('select purpose, retired_at from encryption_keys order by id')
    expect(keys.map((k) => [k.purpose, k.retired_at !== null])).toEqual([
      ['index', false],
      ['data', true],
      ['data', false],
    ])
  })
})

describe('masterKeysFromEnv', () => {
  const key = newKey().toString('base64')
  it('prefers the key file, then the variable', () => {
    expect(masterKeysFromEnv({ ENCRYPTION_KEY_FILE: '/k' }, () => key)).toHaveLength(1)
    expect(masterKeysFromEnv({ ENCRYPTION_KEY: key }, () => '')).toHaveLength(1)
    expect(() => masterKeysFromEnv({}, () => '')).toThrow('ENCRYPTION_KEY_FILE')
  })
})
