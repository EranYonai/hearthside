import { describe, expect, it } from 'vitest'
import { normalizeRecoveryCode, randomToken, recoveryCode, sha256 } from './tokens'

describe('tokens', () => {
  it('makes url-safe random tokens', () => {
    const a = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(a)
  })

  it('hashes with sha256', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('makes readable recovery codes', () => {
    const code = recoveryCode()
    expect(code).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/)
  })

  it('normalizes typed codes', () => {
    expect(normalizeRecoveryCode(' k7pq m2xd 9rta ')).toBe('K7PQ-M2XD-9RTA')
    expect(normalizeRecoveryCode('K7PQ-M2XD-9RTA')).toBe('K7PQ-M2XD-9RTA')
    expect(normalizeRecoveryCode('short')).toBe('SHORT')
  })
})
