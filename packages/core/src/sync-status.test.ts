import { describe, expect, it } from 'vitest'
import { STALE_AFTER_MS, formatAge, syncState } from './sync-status'

const now = new Date('2026-10-30T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

describe('syncState', () => {
  it('reports a running sync first', () => {
    expect(syncState({ running: true, lastResult: 'bad_password' }, now)).toBe('syncing')
  })

  it('maps typed failures', () => {
    expect(syncState({ running: false, lastResult: 'bad_password' }, now)).toBe('login')
    expect(syncState({ running: false, lastResult: 'blocked' }, now)).toBe('blocked')
    expect(syncState({ running: false, lastResult: 'site_changed' }, now)).toBe('blocked')
  })

  it('is stale with no success or an old one', () => {
    expect(syncState({ running: false }, now)).toBe('stale')
    expect(
      syncState({ running: false, lastResult: 'ok', lastSuccessAt: ago(STALE_AFTER_MS + 1) }, now),
    ).toBe('stale')
  })

  it('is ok when fresh', () => {
    expect(syncState({ running: false, lastResult: 'ok', lastSuccessAt: ago(1000) }, now)).toBe(
      'ok',
    )
  })
})

describe('formatAge', () => {
  it('formats short ages', () => {
    expect(formatAge(now, now)).toBe('now')
    expect(formatAge(ago(5 * 60000), now)).toBe('5 min')
    expect(formatAge(ago(3 * 3600000), now)).toBe('3 h')
    expect(formatAge(ago(24 * 3600000), now)).toBe('1 day')
    expect(formatAge(ago(50 * 3600000), now)).toBe('2 days')
  })

  it('clamps future dates to now', () => {
    expect(formatAge(new Date(now.getTime() + 1000), now)).toBe('now')
  })
})
