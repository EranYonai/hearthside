import { describe, expect, it, vi } from 'vitest'
import { createDb, createDbHandle, databaseUrl, ping } from './index'

describe('ping', () => {
  it('reports latency on success', async () => {
    let t = 0
    const sql = { unsafe: async () => [] } as never
    expect(await ping(sql, () => (t += 7))).toEqual({ ok: true, latencyMs: 7 })
  })

  it('reports errors without throwing', async () => {
    const sql = { unsafe: () => Promise.reject(new Error('refused')) } as never
    expect(await ping(sql)).toEqual({ ok: false, error: 'refused' })
    const odd = { unsafe: () => Promise.reject('nope') } as never
    expect(await ping(odd)).toEqual({ ok: false, error: 'nope' })
  })
})

describe('createDb', () => {
  it('creates a lazy client without connecting', async () => {
    const { sql, db } = createDb('postgres://u:p@127.0.0.1:1/x')
    expect(db).toBeDefined()
    await sql.end()
  })
})

describe('databaseUrl', () => {
  const read = (path: string) => (path === '/run/secrets/db' ? 's3cr/t\n' : '')

  it('is undefined without DATABASE_URL', () => {
    expect(databaseUrl({}, read)).toBeUndefined()
  })

  it('passes the URL through without a password file', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgres://u:p@db/x' }, read)).toBe('postgres://u:p@db/x')
  })

  it('injects the password from the secret file, encoded', () => {
    const url = databaseUrl(
      { DATABASE_URL: 'postgres://u@db:5432/x', DATABASE_PASSWORD_FILE: '/run/secrets/db' },
      read,
    )
    expect(url).toBe('postgres://u:s3cr%2Ft@db:5432/x')
  })
})

describe('createDbHandle', () => {
  function fakeClient(results: (() => Promise<unknown>)[]) {
    const end = vi.fn(async () => {})
    return { sql: { unsafe: () => results.shift()!(), end }, db: {} } as never as ReturnType<
      typeof createDb
    > & {
      sql: { end: typeof end }
    }
  }

  it('reports no database when no URL resolves', () => {
    const handle = createDbHandle(() => undefined)
    expect(handle.get()).toBeUndefined()
    expect(handle.pinger()).toBeUndefined()
  })

  it('reuses the client while pings succeed', async () => {
    const client = fakeClient([async () => [], async () => []])
    const factory = vi.fn(() => client)
    const handle = createDbHandle(() => 'postgres://x', factory)
    expect((await handle.pinger()!()).ok).toBe(true)
    expect((await handle.pinger()!()).ok).toBe(true)
    expect(factory).toHaveBeenCalledOnce()
  })

  it('rebuilds the client with a fresh URL after a failed ping', async () => {
    const broken = fakeClient([() => Promise.reject(new Error('auth failed'))])
    const healthy = fakeClient([async () => []])
    const urls = ['postgres://old', 'postgres://new']
    const factory = vi.fn().mockReturnValueOnce(broken).mockReturnValueOnce(healthy)
    const handle = createDbHandle(() => urls.shift(), factory)
    expect(await handle.pinger()!()).toEqual({ ok: false, error: 'auth failed' })
    expect(broken.sql.end).toHaveBeenCalledOnce()
    expect((await handle.pinger()!()).ok).toBe(true)
    expect(factory.mock.calls).toEqual([['postgres://old'], ['postgres://new']])
  })

  it('ignores errors while closing a broken client', async () => {
    const broken = fakeClient([() => Promise.reject(new Error('down'))])
    broken.sql.end.mockRejectedValueOnce(new Error('already closed'))
    const handle = createDbHandle(
      () => 'postgres://x',
      () => broken,
    )
    expect((await handle.pinger()!()).ok).toBe(false)
  })
})
