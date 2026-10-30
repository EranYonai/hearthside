import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const ts = (name: string) => timestamp(name, { withTimezone: true })

/** One deployment serves exactly one household; the singleton index enforces it. */
export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
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
    name: text('name').notNull(),
    role: text('role', { enum: ['owner', 'adult', 'viewer'] }).notNull(),
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
    name: text('name').notNull(),
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
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
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
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
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
    name: text('name').notNull(),
    kind: text('kind', { enum: ['card', 'bank', 'other'] }).notNull(),
    /** Where statements come from (see PROVIDERS in core); null when unknown. */
    provider: text('provider'),
    /** Card network for card styling, e.g. visa or mastercard. */
    network: text('network'),
    /** Last four digits of the card or account number. */
    last4: text('last4'),
    /** household: everyone sees it; private: only the owner. */
    visibility: text('visibility', { enum: ['household', 'private'] })
      .notNull()
      .default('household'),
    createdAt: createdAt(),
  },
  (t) => [
    index('accounts_household_idx').on(t.householdId),
    index('accounts_source_idx').on(t.ownerId, t.provider, t.last4),
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
    fileName: text('file_name').notNull(),
    /** SHA-256 of the file, to warn about uploading the same file twice. */
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
    description: text('description').notNull(),
    /** normalizeDescription(description), for category rules. */
    descriptionKey: text('description_key').notNull(),
    /** Integer minor units; negative is money out. */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('ILS'),
    originalMinor: bigint('original_minor', { mode: 'number' }),
    originalCurrency: text('original_currency'),
    installmentN: smallint('installment_n'),
    installmentTotal: smallint('installment_total'),
    reference: text('reference'),
    notes: text('notes'),
    category: text('category'),
    categorySource: text('category_source', { enum: ['rule', 'manual'] }),
    /** SHA-256 of the duplicate key from the parser. */
    dedupKey: text('dedup_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('transactions_dedup_idx').on(t.accountId, t.dedupKey),
    index('transactions_household_date_idx').on(t.householdId, t.occurredOn),
    index('transactions_batch_idx').on(t.batchId),
    index('transactions_description_idx').on(t.householdId, t.descriptionKey),
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
    /** normalizeDescription() of the transaction description. */
    match: text('match').notNull(),
    category: text('category').notNull(),
    createdBy: uuid('created_by').references(() => members.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('category_rules_match_idx').on(t.householdId, t.match)],
)

export type Household = typeof households.$inferSelect
export type MemberRow = typeof members.$inferSelect
export type PasskeyRow = typeof passkeys.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type InviteRow = typeof invites.$inferSelect
export type AccountRow = typeof accounts.$inferSelect
export type TransactionRow = typeof transactions.$inferSelect
export type ImportBatchRow = typeof importBatches.$inferSelect
