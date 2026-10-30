import { afterEach, describe, expect, it, vi } from 'vitest'
import { beat, startHeartbeat } from './heartbeat'

const logger = () => ({ info: vi.fn(), warn: vi.fn() })
const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('beat', () => {
  it('logs ok when the web app is healthy', async () => {
    const log = logger()
    const fetch = respond(200, { status: 'ok' })
    expect(await beat({ webUrl: 'http://web:3000', intervalMs: 1, logger: log, fetch })).toBe(true)
    expect(log.info).toHaveBeenCalledWith({ web: 'ok' }, 'heartbeat')
    expect(vi.mocked(fetch).mock.calls[0]![0]!.toString()).toBe('http://web:3000/api/health')
  })

  it('warns when the web app is degraded', async () => {
    const log = logger()
    expect(
      await beat({
        webUrl: 'http://w',
        intervalMs: 1,
        logger: log,
        fetch: respond(503, { status: 'degraded' }),
      }),
    ).toBe(false)
    expect(log.warn).toHaveBeenCalledWith({ web: 'degraded' }, 'web app unhealthy')
    expect(
      await beat({ webUrl: 'http://w', intervalMs: 1, logger: log, fetch: respond(500, {}) }),
    ).toBe(false)
    expect(log.warn).toHaveBeenCalledWith({ web: 500 }, 'web app unhealthy')
  })

  it('warns when the web app is unreachable', async () => {
    const log = logger()
    const fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof globalThis.fetch
    expect(await beat({ webUrl: 'http://w', intervalMs: 1, logger: log, fetch })).toBe(false)
    expect(log.warn).toHaveBeenCalledWith({ err: 'ECONNREFUSED' }, 'web app unreachable')
    const odd = vi.fn(async () => Promise.reject('x')) as unknown as typeof globalThis.fetch
    await beat({ webUrl: 'http://w', intervalMs: 1, logger: log, fetch: odd })
    expect(log.warn).toHaveBeenCalledWith({ err: 'x' }, 'web app unreachable')
  })
})

describe('startHeartbeat', () => {
  afterEach(() => vi.useRealTimers())

  it('beats immediately and on an interval until stopped', async () => {
    vi.useFakeTimers()
    const fetch = respond(200, { status: 'ok' })
    const stop = startHeartbeat({ webUrl: 'http://w', intervalMs: 1000, logger: logger(), fetch })
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(fetch).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
