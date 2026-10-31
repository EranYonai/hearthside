import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { decrypt, encrypt } from './crypto'

/**
 * Private values are sealed by the app before they reach Postgres (see crypto.ts), so a dump
 * or a stray query shows ciphertext only. The column name is bound into each value. Encrypted
 * columns can't be searched, sorted or summed in SQL; do that after reading. Exact matches go
 * through a separate keyed-hash column (blindIndex).
 */
function encrypted<T>(column: string, encode: (v: T) => string, decode: (s: string) => T) {
  return (table: string) =>
    customType<{ data: T; driverData: string }>({
      dataType: () => 'text',
      toDriver: (value) => encrypt(encode(value), `${table}.${column}`),
      fromDriver: (value) => decode(decrypt(value, `${table}.${column}`)),
    })(column)
}

const encText = (table: string, column: string) => encrypted<string>(column, String, String)(table)
const encInt = (table: string, column: string) =>
  encrypted<number>(
    column,
    (n) => {
      if (!Number.isSafeInteger(n)) throw new TypeError(`${column} must be a whole number`)
      return String(n)
    },
    Number,
  )(table)
const encJson = <T>(table: string, column: string) =>
  encrypted<T>(
    column,
    (v) => JSON.stringify(v),
    (s) => JSON.parse(s) as T,
  )(table)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const ts = (name: string) => timestamp(name, { withTimezone: true })

/** One deployment serves exactly one household; the singleton index enforces it. */
export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: encText('households', 'name').notNull(),
    createdAt: createdAt(),
  },
  () => [uniqueIndex('households_singleton').on(sql`(true)`)],
)

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: encText('members', 'name').notNull(),
    role: text('role', { enum: ['owner', 'adult', 'viewer'] }).notNull(),
    /** ISO 4217 code amounts are shown in. */
    displayCurrency: text('display_currency').notNull().default('ILS'),
    /** Set when the member finishes or skips the welcome steps. */
    onboardedAt: ts('onboarded_at'),
    createdAt: createdAt(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    index('members_household_idx').on(t.householdId),
    check('members_role_check', sql`${t.role} in ('owner', 'adult', 'viewer')`),
  ],
)

export const passkeys = pgTable(
  'passkeys',
  {
    /** Credential id, base64url. */
    id: text('id').primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** COSE public key, base64url. */
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    name: encText('passkeys', 'name').notNull(),
    createdAt: createdAt(),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [index('passkeys_member_idx').on(t.memberId)],
)

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token, hex. The token itself is never stored. */
    id: text('id').primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    /** Signed in with a recovery code: must add a passkey. */
    viaRecovery: boolean('via_recovery').notNull().default(false),
  },
  (t) => [index('sessions_member_idx').on(t.memberId)],
)

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    role: text('role', { enum: ['adult', 'viewer'] }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    usedBy: uuid('used_by').references(() => members.id, { onDelete: 'set null' }),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('invites_token_idx').on(t.tokenHash)],
)

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    createdAt: createdAt(),
    usedAt: ts('used_at'),
  },
  (t) => [uniqueIndex('recovery_codes_hash_idx').on(t.codeHash)],
)

/** Short-lived WebAuthn challenges, keyed by an httpOnly cookie. */
export const authChallenges = pgTable('auth_challenges', {
  id: text('id').primaryKey(),
  challenge: text('challenge').notNull(),
  purpose: text('purpose', { enum: ['setup', 'login', 'invite', 'add-passkey'] }).notNull(),
  payload: encJson<Record<string, unknown>>('auth_challenges', 'payload').notNull(),
  expiresAt: ts('expires_at').notNull(),
})

/** Append-only. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    householdId: uuid('household_id').references(() => households.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    detail: encJson<Record<string, unknown>>('audit_log', 'detail').notNull(),
    ip: encText('audit_log', 'ip'),
    /** blindIndex(ip), for rate limits. */
    ipHash: text('ip_hash'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_action_time_idx').on(t.action, t.createdAt)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** The member who holds the card or account; null means the owner. */
    holderId: uuid('holder_id').references(() => members.id, { onDelete: 'set null' }),
    name: encText('accounts', 'name').notNull(),
    kind: text('kind', { enum: ['card', 'bank', 'other'] }).notNull(),
    /** Where statements come from (see PROVIDERS in core); null when unknown. */
    provider: encText('accounts', 'provider'),
    /** Card network for card styling, e.g. visa or mastercard. */
    network: encText('accounts', 'network'),
    /** Last four digits of the card or account number. Matched after reading. */
    last4: encText('accounts', 'last4'),
    /** household: everyone sees it; private: only the owner. */
    visibility: text('visibility', { enum: ['household', 'private'] })
      .notNull()
      .default('household'),
    createdAt: createdAt(),
  },
  (t) => [
    index('accounts_household_idx').on(t.householdId),
    check('accounts_kind_check', sql`${t.kind} in ('card', 'bank', 'other')`),
    check('accounts_visibility_check', sql`${t.visibility} in ('household', 'private')`),
  ],
)

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    fileName: encText('import_batches', 'file_name').notNull(),
    /** blindIndex(SHA-256 of the file), to warn about uploading the same file twice. */
    fileHash: text('file_hash').notNull(),
    added: integer('added').notNull(),
    duplicates: integer('duplicates').notNull(),
    skipped: integer('skipped').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('import_batches_account_idx').on(t.accountId)],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').references(() => importBatches.id, { onDelete: 'cascade' }),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    postedOn: date('posted_on', { mode: 'string' }),
    description: encText('transactions', 'description').notNull(),
    /** blindIndex(normalizeDescription(description)), for category rules. */
    descriptionKey: text('description_key').notNull(),
    /** Integer minor units; negative is money out. */
    amountMinor: encInt('transactions', 'amount_minor').notNull(),
    currency: text('currency').notNull().default('ILS'),
    originalMinor: encInt('transactions', 'original_minor'),
    originalCurrency: text('original_currency'),
    installmentN: smallint('installment_n'),
    installmentTotal: smallint('installment_total'),
    reference: encText('transactions', 'reference'),
    notes: encText('transactions', 'notes'),
    category: text('category'),
    /** rule: an "always use this" rule; manual: someone picked it; auto: the categorizer. */
    categorySource: text('category_source', { enum: ['rule', 'manual', 'auto'] }),
    /** For auto: history, keyword or model. */
    categoryVia: text('category_via'),
    /** For auto: 0..1. */
    categoryConfidence: real('category_confidence'),
    /** When the categorizer (with the model) last looked at it. null means it is waiting. */
    categoryCheckedAt: timestamp('category_checked_at', { withTimezone: true }),
    /**
     * Bank rows only: this row pays a card bill. amount: it pays what a card bill adds up to;
     * name: its description names a card company. Kept up to date by linkCardBills.
     */
    cardBill: text('card_bill', { enum: ['amount', 'name'] }),
    /** The card account it pays, when that is a single one. */
    cardBillAccountId: uuid('card_bill_account_id').references(() => accounts.id, {
      onDelete: 'set null',
    }),
    /** What the card statements say the bill is (negative), to compare with what was paid. */
    cardBillExpectedMinor: encInt('transactions', 'card_bill_expected_minor'),
    /** blindIndex(SHA-256 of the duplicate key from the parser). */
    dedupKey: text('dedup_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('transactions_dedup_idx').on(t.accountId, t.dedupKey),
    index('transactions_household_date_idx').on(t.householdId, t.occurredOn),
    index('transactions_batch_idx').on(t.batchId),
    index('transactions_description_idx').on(t.householdId, t.descriptionKey),
    index('transactions_uncategorized_idx')
      .on(t.householdId)
      .where(sql`${t.category} is null and ${t.categoryCheckedAt} is null`),
    check('transactions_card_bill_check', sql`${t.cardBill} in ('amount', 'name')`),
  ],
)

/** "Always file this description under that category." */
export const categoryRules = pgTable(
  'category_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** Same keyed hash as transactions.description_key. */
    match: text('match').notNull(),
    category: text('category').notNull(),
    createdBy: uuid('created_by').references(() => members.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('category_rules_match_idx').on(t.householdId, t.match)],
)

/** Categories a household added on top of the built-in ones. */
export const householdCategories = pgTable(
  'household_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** "c-" plus random characters; what transactions and rules store. */
    slug: text('slug').notNull(),
    label: encText('household_categories', 'label').notNull(),
    /** blindIndex(lowercased label), so names stay unique per household. */
    labelKey: text('label_key').notNull(),
    icon: text('icon').notNull(),
    direction: text('direction', { enum: ['out', 'in'] })
      .notNull()
      .default('out'),
    keywords: encJson<string[]>('household_categories', 'keywords').notNull(),
    createdBy: uuid('created_by').references(() => members.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('household_categories_slug_idx').on(t.householdId, t.slug),
    uniqueIndex('household_categories_label_idx').on(t.householdId, t.labelKey),
    check('household_categories_direction_check', sql`${t.direction} in ('out', 'in')`),
  ],
)

/**
 * Data keys, wrapped by the master key. Purpose 'data' seals values (newest active one is used;
 * retired ones only decrypt until rows are re-encrypted); 'index' keys the blind indexes.
 */
export const encryptionKeys = pgTable(
  'encryption_keys',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    purpose: text('purpose', { enum: ['data', 'index'] }).notNull(),
    wrapped: text('wrapped').notNull(),
    /** masterKeyId() of the key that wrapped it. */
    masterKeyId: text('master_key_id').notNull(),
    createdAt: createdAt(),
    retiredAt: ts('retired_at'),
  },
  (t) => [check('encryption_keys_purpose_check', sql`${t.purpose} in ('data', 'index')`)],
)

export type Household = typeof households.$inferSelect
export type MemberRow = typeof members.$inferSelect
export type PasskeyRow = typeof passkeys.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type InviteRow = typeof invites.$inferSelect
export type AccountRow = typeof accounts.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect
export type ImportBatchRow = typeof importBatches.$inferSelect
export type HouseholdCategoryRow = typeof householdCategories.$inferSelect
