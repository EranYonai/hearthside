import { describe, expect, it, vi } from 'vitest'
import { backupAge, fetchBackup } from './backups'

const now = new Date('2026-11-10T08:00:00Z')

describe('backupAge', () => {
  it('reminds after a week', () => {
    expect(backupAge(undefined, now).state).toBe('never')
    expect(backupAge(new Date('2026-11-08T08:00:00Z'), now)).toMatchObject({
      state: 'recent',
      days: 2,
    })
    expect(backupAge(new Date('2026-11-01T08:00:00Z'), now)).toMatchObject({
      state: 'old',
      days: 9,
    })
  })
})

describe('fetchBackup', () => {
  const respond = (status: number, body = 'x') =>
    vi.fn(async () => new Response(status === 200 ? body : 'no', { status }))

  it('returns the dump and sends the token', async () => {
    const f = respond(200, 'secret-bytes')
    const r = await fetchBackup(
      'http://backup:8080',
      'tok',
      undefined,
      f as unknown as typeof fetch,
    )
    expect(r.ok && new TextDecoder().decode(r.data)).toBe('secret-bytes')
    expect(f).toHaveBeenCalledWith(
      'http://backup:8080/dump',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
  })

  it('explains each failure', async () => {
    expect(await fetchBackup(undefined, 't')).toMatchObject({ ok: false })
    const noKey = await fetchBackup('u', 't', undefined, respond(503) as unknown as typeof fetch)
    expect(noKey).toEqual({ ok: false, error: 'No backup key is set on the server' })
    expect(
      await fetchBackup('u', 't', undefined, respond(500) as unknown as typeof fetch),
    ).toMatchObject({
      ok: false,
    })
    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(await fetchBackup('u', 't', undefined, down as unknown as typeof fetch)).toMatchObject({
      ok: false,
    })
  })
})
