import { describe, expect, it, vi } from 'vitest'
import { authConfig } from './config'
import { cleanName, clientIp, errorResponse, readJson, sameOrigin } from './http'
import { AuthError } from './repo'

const config = authConfig({ APP_ORIGIN: 'https://home.example.com' })
const req = (headers: Record<string, string>, body?: string) =>
  new Request('https://home.example.com/api', { method: 'POST', headers, body })

describe('http helpers', () => {
  it('accepts same-origin and origin-less requests only', () => {
    expect(sameOrigin(req({ origin: 'https://home.example.com' }), config)).toBe(true)
    expect(sameOrigin(req({}), config)).toBe(true)
    expect(sameOrigin(req({ origin: 'https://evil.example' }), config)).toBe(false)
  })

  it('reads the client ip from proxy headers', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('1.2.3.4')
    expect(clientIp(req({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8')
    expect(clientIp(req({}))).toBeNull()
  })

  it('reads json or nothing', async () => {
    expect(await readJson(req({}, '{"a":1}'))).toEqual({ a: 1 })
    expect(await readJson(req({}, 'nope'))).toBeUndefined()
  })

  it('cleans names', () => {
    expect(cleanName('  Alex   Smith ')).toBe('Alex Smith')
    expect(cleanName('')).toBeUndefined()
    expect(cleanName('x'.repeat(61))).toBeUndefined()
    expect(cleanName(42)).toBeUndefined()
  })

  it('maps errors without leaking details', async () => {
    expect(errorResponse(new AuthError('not_allowed', 'Only the owner can do that')).status).toBe(
      403,
    )
    expect(errorResponse(new AuthError('not_found', 'x')).status).toBe(404)
    expect(errorResponse(new AuthError('invite_invalid', 'x')).status).toBe(409)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = errorResponse(new Error('connection string postgres://secret'))
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('secret')
    log.mockRestore()
  })
})
