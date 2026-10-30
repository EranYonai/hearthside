import { describe, expect, it } from 'vitest'
import { appVersion, versionLabel } from './version'

describe('appVersion', () => {
  it('reads the baked-in version and commit', () => {
    const v = appVersion({ version: '0.1.0', commit: 'abc1234' })
    expect(v).toEqual({ version: '0.1.0', commit: 'abc1234' })
    expect(versionLabel(v)).toBe('v0.1.0 · abc1234')
  })

  it('falls back when nothing was baked in', () => {
    expect(appVersion({})).toEqual({ version: '0.0.0', commit: 'dev' })
    expect(appVersion().version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
