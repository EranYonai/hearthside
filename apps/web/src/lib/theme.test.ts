import { describe, expect, it } from 'vitest'
import { THEME_KEY, applyTheme, nextTheme, readTheme } from './theme'

describe('theme', () => {
  it('reads saved choices and falls back to system', () => {
    expect(readTheme({ getItem: () => 'dark' })).toBe('dark')
    expect(readTheme({ getItem: () => 'purple' })).toBe('system')
    expect(readTheme(undefined)).toBe('system')
    expect(
      readTheme({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('system')
  })

  it('applies and persists the choice', () => {
    const root = document.createElement('html')
    localStorage.clear()
    applyTheme('dark', root, localStorage)
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    applyTheme('system', root, localStorage)
    expect(root.dataset.theme).toBeUndefined()
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('survives blocked storage', () => {
    const root = document.createElement('html')
    const broken = {
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    applyTheme('light', root, broken)
    expect(root.dataset.theme).toBe('light')
  })

  it('cycles system, light, dark', () => {
    expect(nextTheme('system')).toBe('light')
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
  })
})
