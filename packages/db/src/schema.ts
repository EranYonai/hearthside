import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
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

export type Household = typeof households.$inferSelect
export type MemberRow = typeof members.$inferSelect
export type PasskeyRow = typeof passkeys.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type InviteRow = typeof invites.$inferSelect
