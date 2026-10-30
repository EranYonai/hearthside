import { describe, expect, it, vi } from 'vitest'
import { checkHealth } from './health'

const V = { version: '1', commit: 'abc' }

describe('checkHealth', () => {
  it('is ok without a database configured', async () => {
    expect(await checkHealth(undefined, V)).toEqual({
      status: 'ok',
      version: '1',
      commit: 'abc',
      db: 'not_configured',
    })
  })

  it('reports a healthy database', async () => {
    const health = await checkHealth(async () => ({ ok: true, latencyMs: 2 }), V)
    expect(health).toEqual({ status: 'ok', version: '1', commit: 'abc', db: 'ok' })
  })

  it('degrades and hides the error when the database is down', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const health = await checkHealth(
      async () => ({ ok: false, error: 'password authentication failed' }),
      V,
    )
    expect(health).toEqual({ status: 'degraded', version: '1', commit: 'abc', db: 'down' })
    expect(JSON.stringify(health)).not.toContain('password')
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
