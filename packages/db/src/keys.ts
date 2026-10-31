import { asc, eq, sql } from 'drizzle-orm'
import {
  BLIND_PREFIX,
  CIPHER_PREFIX,
  KeyError,
  blindWith,
  decryptWith,
  encryptWith,
  masterKeyId,
  newKey,
  parseMasterKeys,
  sealedKeyId,
  setKeyring,
  unwrapKey,
  wrapKey,
  type Keyring,
} from './crypto'
import type { Db } from './index'
import { encryptionKeys } from './schema'

/**
 * Read the master keys: ENCRYPTION_KEY_FILE (a Compose secret) or, for development and tests,
 * ENCRYPTION_KEY. See docs/encryption.md.
 */
export function masterKeysFromEnv(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string,
): Buffer[] {
  if (env.ENCRYPTION_KEY_FILE) return parseMasterKeys(readFile(env.ENCRYPTION_KEY_FILE))
  if (env.ENCRYPTION_KEY) return parseMasterKeys(env.ENCRYPTION_KEY)
  throw new KeyError('Set ENCRYPTION_KEY_FILE (or ENCRYPTION_KEY) to the master key')
}

export interface KeyReport {
  keyring: Keyring
  /** Data keys rewrapped because the first master key changed. */
  rewrapped: number
  /** A new data key was created (first start or rotation). */
  newDataKey: boolean
}

/**
 * Unwrap the data keys and install them for this process. Creates the keys on first start.
 * When the first master key is new, every data key is rewrapped under it and a fresh data key
 * becomes active; encryptExisting() then moves rows onto it.
 */
export async function loadKeys(db: Db, masterKeys: readonly Buffer[]): Promise<KeyReport> {
  const current = masterKeys[0]
  if (!current) throw new KeyError('No master key')
  const currentId = masterKeyId(current)
  const masters = new Map(masterKeys.map((k) => [masterKeyId(k), k]))

  const report = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hearthside.encryption_keys'))`)
    const rows = await tx.select().from(encryptionKeys).orderBy(asc(encryptionKeys.id))
    const dataKeys = new Map<number, Buffer>()
    let indexKey: Buffer | undefined
    let rewrapped = 0
    for (const row of rows) {
      const master = masters.get(row.masterKeyId)
      if (!master)
        throw new KeyError(
          `Key ${row.id} was wrapped by master key ${row.masterKeyId}, which isn't in the key file`,
        )
      const key = unwrapKey(master, row.wrapped, row.purpose)
      if (row.masterKeyId !== currentId) {
        await tx
          .update(encryptionKeys)
          .set({ wrapped: wrapKey(current, key, row.purpose), masterKeyId: currentId })
          .where(eq(encryptionKeys.id, row.id))
        rewrapped++
      }
      if (row.purpose === 'index') indexKey ??= key
      else dataKeys.set(row.id, key)
    }

    const add = async (purpose: 'data' | 'index', key: Buffer) => {
      const [row] = await tx
        .insert(encryptionKeys)
        .values({ purpose, wrapped: wrapKey(current, key, purpose), masterKeyId: currentId })
        .returning({ id: encryptionKeys.id })
      return row!.id
    }
    if (!indexKey) {
      indexKey = newKey()
      await add('index', indexKey)
    }
    const live = rows.filter((r) => r.purpose === 'data' && !r.retiredAt)
    let activeId = live.at(-1)?.id
    const newDataKey = activeId === undefined || rewrapped > 0
    if (newDataKey) {
      const key = newKey()
      activeId = await add('data', key)
      dataKeys.set(activeId, key)
    }
    return { keyring: { activeId: activeId!, dataKeys, indexKey }, rewrapped, newDataKey }
  })
  setKeyring(report.keyring)
  return report
}

/** Every private column; must match the encText/encInt/encJson columns in schema.ts. */
export const ENCRYPTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  households: ['name', 'invest_settings'],
  members: ['name'],
  passkeys: ['name'],
  auth_challenges: ['payload'],
  audit_log: ['detail', 'ip'],
  accounts: ['name', 'provider', 'network', 'last4', 'color'],
  import_batches: ['file_name'],
  transactions: [
    'description',
    'amount_minor',
    'original_minor',
    'reference',
    'notes',
    'card_bill_expected_minor',
  ],
  household_categories: ['label', 'keywords'],
  investment_accounts: ['name', 'provider'],
  brand_logos: ['image'],
  instruments: ['symbol', 'name', 'quote_symbol', 'prev_close', 'facts'],
  holdings: ['units', 'cost_minor'],
  instrument_prices: ['price'],
  investment_transactions: ['units', 'amount_minor'],
  portfolio_snapshots: ['value_minor'],
}

/** Keyed-hash columns; their plaintext form was the value itself (or its SHA-256). */
export const BLIND_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  audit_log: ['ip_hash'],
  import_batches: ['file_hash'],
  transactions: ['description_key', 'dedup_key'],
  category_rules: ['match'],
  household_categories: ['label_key'],
  instruments: ['symbol_key'],
  investment_transactions: ['dedup_key'],
  brand_logos: ['brand_key'],
}

const CHUNK = 1000

async function rewriteColumn(
  db: Db,
  table: string,
  column: string,
  pending: ReturnType<typeof sql>,
  convert: (value: string) => string,
): Promise<number> {
  const t = sql.identifier(table)
  const c = sql.identifier(column)
  let total = 0
  for (;;) {
    const rows = (await db.execute(
      sql`select id::text as id, ${c}::text as v from ${t} where ${c} is not null and ${pending} limit ${CHUNK}`,
    )) as unknown as { id: string; v: string }[]
    if (rows.length === 0) return total
    const updates = JSON.stringify(rows.map((r) => ({ id: r.id, v: convert(r.v) })))
    await db.execute(
      sql`update ${t} set ${c} = u.v from json_to_recordset(${updates}::json) as u(id text, v text) where ${t}.id::text = u.id`,
    )
    total += rows.length
  }
}

/**
 * Bring every private value under the active data key: seal plaintext left from before
 * encryption, re-seal values under older data keys, and hash plaintext lookup columns. Then
 * retire data keys nothing uses. Safe to run on every start; a no-op once done.
 */
export async function encryptExisting(db: Db, keyring: Keyring): Promise<number> {
  const activePrefix = `${CIPHER_PREFIX}${keyring.activeId}:`
  let total = 0
  for (const [table, columns] of Object.entries(ENCRYPTED_COLUMNS)) {
    for (const column of columns) {
      const aad = `${table}.${column}`
      const c = sql.identifier(column)
      total += await rewriteColumn(
        db,
        table,
        column,
        sql`left(${c}::text, ${activePrefix.length}) <> ${activePrefix}`,
        (v) =>
          encryptWith(keyring, sealedKeyId(v) === null ? v : decryptWith(keyring, v, aad), aad),
      )
    }
  }
  for (const [table, columns] of Object.entries(BLIND_COLUMNS)) {
    for (const column of columns) {
      const c = sql.identifier(column)
      total += await rewriteColumn(
        db,
        table,
        column,
        sql`left(${c}, ${BLIND_PREFIX.length}) <> ${BLIND_PREFIX}`,
        (v) => blindWith(keyring, v),
      )
    }
  }
  await db.execute(
    sql`update encryption_keys set retired_at = now() where purpose = 'data' and id <> ${keyring.activeId} and retired_at is null`,
  )
  return total
}
