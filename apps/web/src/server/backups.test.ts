import { describe, expect, it } from 'vitest'
import { parseBackupStatus } from './backups'

const now = new Date('2026-11-02T08:00:00Z')
const line = (o: object) => JSON.stringify(o)

describe('parseBackupStatus', () => {
  it('reads a recent good backup', () => {
    const s = parseBackupStatus(
      line({ at: '2026-11-02T03:00:00Z', ok: true, bytes: 1200, offsite: true, error: '' }),
      now,
    )
    expect(s).toMatchObject({ state: 'ok', bytes: 1200, offsite: true })
  })

  it('flags a failed run and an old one', () => {
    expect(
      parseBackupStatus(line({ at: '2026-11-02T03:00:00Z', ok: false, error: 'x' }), now).state,
    ).toBe('failed')
    expect(parseBackupStatus(line({ at: '2026-10-30T03:00:00Z', ok: true }), now).state).toBe(
      'stale',
    )
  })

  it('treats missing or broken files as not set up', () => {
    expect(parseBackupStatus(undefined, now).state).toBe('none')
    expect(parseBackupStatus('{oops', now).state).toBe('none')
    expect(parseBackupStatus(line({ ok: true }), now).state).toBe('none')
  })
})
