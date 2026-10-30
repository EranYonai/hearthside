import { describe, expect, it } from 'vitest'
import { createDb, databaseUrl, ping } from './index'

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
