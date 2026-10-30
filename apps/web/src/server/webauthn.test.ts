import { describe, expect, it } from 'vitest'
import { authConfig } from './config'
import { authenticationOptions, deviceLabel, registrationOptions } from './webauthn'

const config = authConfig({ APP_ORIGIN: 'https://home.example.com' })

describe('webauthn', () => {
  it('names passkeys after the device', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(deviceLabel('Mozilla/5.0 (iPad; CPU OS 18_0)')).toBe('iPad')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 15)')).toBe('Android')
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)')).toBe('Mac')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows')
    expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux')
    expect(deviceLabel(null)).toBe('Passkey')
  })

  it('asks for discoverable passkeys and excludes existing ones', async () => {
    const options = await registrationOptions(config, { id: 'm1', name: 'Alex' }, [
      { id: 'abc', transports: ['internal'] },
    ])
    expect(options.rp).toEqual({ name: 'Hearthside', id: 'home.example.com' })
    expect(options.authenticatorSelection?.residentKey).toBe('required')
    expect(options.excludeCredentials).toEqual([
      { id: 'abc', type: 'public-key', transports: ['internal'] },
    ])
  })

  it('never lists credentials on sign-in', async () => {
    const options = await authenticationOptions(config)
    expect(options.rpId).toBe('home.example.com')
    expect(options.allowCredentials ?? []).toEqual([])
  })
})
