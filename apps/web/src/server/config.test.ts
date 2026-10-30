import { describe, expect, it } from 'vitest'
import { authConfig } from './config'

describe('authConfig', () => {
  it('derives the relying party from the origin', () => {
    expect(authConfig({ APP_ORIGIN: 'https://home.example.com/' })).toEqual({
      origin: 'https://home.example.com',
      rpId: 'home.example.com',
      rpName: 'Hearthside',
      secureCookies: true,
    })
  })

  it('defaults to local http without secure cookies', () => {
    const config = authConfig({})
    expect(config.rpId).toBe('localhost')
    expect(config.secureCookies).toBe(false)
  })
})
