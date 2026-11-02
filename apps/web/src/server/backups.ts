// Server only: talks to the backup service and reads the audit log.
import type { Db, MemberRow } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, desc, eq } from 'drizzle-orm'
import { isRecipient } from '../lib/backup-key'
import { audit, AuthError } from './repo'

/** Remind the owner to download a fresh backup after this long. */
export const BACKUP_REMIND_DAYS = 7
export const BACKUP_DOWNLOADED = 'backup.downloaded'

export type BackupAge = { state: 'never' } | { state: 'recent' | 'old'; at: Date; days: number }

export function backupAge(at: Date | undefined, now = new Date()): BackupAge {
  if (!at) return { state: 'never' }
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000)
  return { state: days >= BACKUP_REMIND_DAYS ? 'old' : 'recent', at, days }
}

/** When the household's last backup was downloaded, from the audit log. */
export async function lastBackupDownload(db: Db, householdId: string): Promise<Date | undefined> {
  const [row] = await db
    .select({ at: schema.auditLog.createdAt })
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.householdId, householdId),
        eq(schema.auditLog.action, BACKUP_DOWNLOADED),
      ),
    )
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(1)
  return row?.at
}

export type BackupResult = { ok: true; data: ArrayBuffer } | { ok: false; error: string }

/** Asks the backup service for a fresh encrypted dump. Nothing is stored on the way. */
export async function fetchBackup(
  url: string | undefined,
  token: string,
  extraRecipient?: string,
  fetcher: typeof fetch = fetch,
): Promise<BackupResult> {
  if (!url) return { ok: false, error: 'Backups aren’t set up on this server' }
  let res: Response
  try {
    res = await fetcher(`${url}/dump`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(extraRecipient && isRecipient(extraRecipient)
          ? { 'X-Backup-Recipient': extraRecipient }
          : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5 * 60_000),
    })
  } catch {
    return { ok: false, error: 'The backup service isn’t reachable' }
  }
  if (res.status === 503) return { ok: false, error: 'No backup key is set on the server' }
  if (!res.ok) return { ok: false, error: 'The backup failed. Check the server logs.' }
  const data = await res.arrayBuffer()
  if (data.byteLength === 0) return { ok: false, error: 'The backup came back empty' }
  return { ok: true, data }
}

export type BackupKey = { recipient: string; credentialId: string } | undefined

/** The passkey-derived backup key, if the owner has linked one. */
export async function getBackupKey(db: Db, householdId: string): Promise<BackupKey> {
  const [row] = await db
    .select({
      recipient: schema.households.backupRecipient,
      credentialId: schema.households.backupCredentialId,
    })
    .from(schema.households)
    .where(eq(schema.households.id, householdId))
  return row?.recipient && row.credentialId
    ? { recipient: row.recipient, credentialId: row.credentialId }
    : undefined
}

/** Owner only. Stores the public half; the secret never leaves the owner's device. */
export async function setBackupKey(
  db: Db,
  member: Pick<MemberRow, 'id' | 'role' | 'householdId'>,
  key: { recipient: string; credentialId: string } | null,
) {
  if (member.role !== 'owner') throw new AuthError('not_allowed', 'Only the owner can do this')
  if (key && (!isRecipient(key.recipient) || !CREDENTIAL_ID.test(key.credentialId)))
    throw new AuthError('not_allowed', 'That passkey key isn’t valid')
  await db
    .update(schema.households)
    .set({ backupRecipient: key?.recipient ?? null, backupCredentialId: key?.credentialId ?? null })
    .where(eq(schema.households.id, member.householdId))
  await audit(db, {
    householdId: member.householdId,
    memberId: member.id,
    action: key ? 'backup.passkey_linked' : 'backup.passkey_unlinked',
  })
}

const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,1024}$/
