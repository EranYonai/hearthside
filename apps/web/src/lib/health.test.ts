import { describe, expect, it, vi } from 'vitest'
import { checkHealth } from './health'

describe('checkHealth', () => {
  it('is ok without a database configured', async () => {
    expect(await checkHealth(undefined, '1')).toEqual({
      status: 'ok',
      version: '1',
      db: 'not_configured',
    })
  })

  it('reports a healthy database', async () => {
    const health = await checkHealth(async () => ({ ok: true, latencyMs: 2 }), '1')
    expect(health).toEqual({ status: 'ok', version: '1', db: 'ok' })
  })

  it('degrades and hides the error when the database is down', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const health = await checkHealth(
      async () => ({ ok: false, error: 'password authentication failed' }),
      '1',
    )
    expect(health).toEqual({ status: 'degraded', version: '1', db: 'down' })
    expect(JSON.stringify(health)).not.toContain('password')
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
