export type SyncState = 'ok' | 'syncing' | 'stale' | 'blocked' | 'login'

export type RunResult =
  'ok' | 'bad_password' | 'blocked' | 'needs_code' | 'site_changed' | 'timeout'

export interface SourceSnapshot {
  running: boolean
  lastResult?: RunResult
  lastSuccessAt?: Date
}

const HOUR = 60 * 60 * 1000
export const STALE_AFTER_MS = 36 * HOUR

/** Derive the pill state for one source. Problems win over freshness. */
export function syncState(source: SourceSnapshot, now: Date): SyncState {
  if (source.running) return 'syncing'
  if (source.lastResult === 'bad_password') return 'login'
  if (source.lastResult === 'blocked' || source.lastResult === 'site_changed') return 'blocked'
  if (!source.lastSuccessAt) return 'stale'
  return now.getTime() - source.lastSuccessAt.getTime() > STALE_AFTER_MS ? 'stale' : 'ok'
}

/** Short age for captions: "now", "5 min", "3 h", "2 days". */
export function formatAge(from: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - from.getTime())
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 day' : `${d} days`
}
