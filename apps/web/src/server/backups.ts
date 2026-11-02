// Server only: talks to the backup service and reads the audit log.
import type { Db } from '@hearthside/db'
import { schema } from '@hearthside/db'
import { and, desc, eq } from 'drizzle-orm'

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
  fetcher: typeof fetch = fetch,
): Promise<BackupResult> {
  if (!url) return { ok: false, error: 'Backups aren’t set up on this server' }
  let res: Response
  try {
    res = await fetcher(`${url}/dump`, {
      headers: { Authorization: `Bearer ${token}` },
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
