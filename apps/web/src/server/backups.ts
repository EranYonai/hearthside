// Server only: reads a file on disk.
import { readFile } from 'node:fs/promises'

export type BackupStatus =
  | { state: 'none' }
  | {
      state: 'ok' | 'failed' | 'stale'
      at: Date
      bytes: number
      offsite: boolean
      error: string
    }

/** A nightly backup older than this means the schedule stopped. */
const STALE_MS = 36 * 60 * 60 * 1000

/** Reads the status file the backup service writes. Never throws. */
export function parseBackupStatus(text: string | undefined, now = new Date()): BackupStatus {
  if (!text) return { state: 'none' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { state: 'none' }
  }
  if (typeof raw !== 'object' || raw === null) return { state: 'none' }
  const r = raw as Record<string, unknown>
  const at = typeof r.at === 'string' ? new Date(r.at) : undefined
  if (!at || Number.isNaN(at.getTime())) return { state: 'none' }
  const ok = r.ok === true
  const state = !ok ? 'failed' : now.getTime() - at.getTime() > STALE_MS ? 'stale' : 'ok'
  return {
    state,
    at,
    bytes: typeof r.bytes === 'number' && r.bytes >= 0 ? r.bytes : 0,
    offsite: r.offsite === true,
    error: typeof r.error === 'string' ? r.error.slice(0, 200) : '',
  }
}

export async function backupStatus(now = new Date()): Promise<BackupStatus> {
  const file = process.env.BACKUP_STATUS_FILE || '/backups/status.json'
  const text = await readFile(file, 'utf8').catch(() => undefined)
  return parseBackupStatus(text, now)
}
