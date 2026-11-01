import { beforeEach, describe, expect, it } from 'vitest'
import {
  markReset,
  MAX_TRAIL,
  nameOf,
  pageTitle,
  readTrail,
  takeReset,
  visit,
  type Visit,
  writeTrail,
} from './back'

const walk = (...urls: string[]) => urls.reduce<Visit[]>((t, u) => visit(t, u), [])

describe('visit', () => {
  it('adds each new page', () => {
    expect(walk('/accounts', '/accounts/a1').map((v) => v.url)).toEqual([
      '/accounts',
      '/accounts/a1',
    ])
  })

  it('counts moves within a page as steps on the same entry', () => {
    const t = walk(
      '/invest',
      '/invest/trends',
      '/invest/trends?range=1y',
      '/invest/trends?range=all',
    )
    expect(t).toHaveLength(2)
    expect(t[1]).toEqual({ url: '/invest/trends?range=all', steps: 3 })
    // A browser back within the page takes a step off.
    expect(visit(t, '/invest/trends?range=1y', { pop: true })[1]!.steps).toBe(2)
  })

  it('pops back to the page underneath and keeps its query', () => {
    const t = [...walk('/accounts?month=2026-09', '/transactions?account=a1').slice(0, 2)]
    expect(visit(t, '/accounts?month=2026-09', { pop: true })).toEqual([
      { url: '/accounts?month=2026-09', steps: 1 },
    ])
  })

  it('cuts the trail when going back to a page further down', () => {
    const t = walk('/', '/invest', '/invest/a1', '/invest/holding/h1', '/invest?x=1')
    expect(t).toEqual([
      { url: '/', steps: 1 },
      { url: '/invest?x=1', steps: 1, jump: true },
    ])
    // The browser's own back keeps history and trail in step.
    const popped = visit(walk('/', '/invest', '/invest/a1'), '/invest', { pop: true })
    expect(popped.at(-1)).toEqual({ url: '/invest', steps: 1 })
  })

  it('does nothing on a refresh', () => {
    const t = walk('/', '/import')
    expect(visit(t, '/import')).toEqual(t)
  })

  it('starts over from a tab', () => {
    expect(visit(walk('/', '/invest', '/invest/a1'), '/accounts', { reset: true })).toEqual([
      { url: '/accounts', steps: 1 },
    ])
  })

  it('stays short', () => {
    const t = walk(...Array.from({ length: MAX_TRAIL + 5 }, (_, i) => `/accounts/a${i}`))
    expect(t).toHaveLength(MAX_TRAIL)
    expect(t.at(-1)!.url).toBe(`/accounts/a${MAX_TRAIL + 4}`)
  })
})

describe('names', () => {
  it('names the tabs and known pages, then falls back to the title', () => {
    expect(nameOf({ url: '/' })).toBe('Home')
    expect(nameOf({ url: '/transactions?account=a1' })).toBe('Activity')
    expect(nameOf({ url: '/invest/a1', title: 'Investment account' })).toBe('Investment account')
    expect(nameOf({ url: '/invest/a1' })).toBe('Back')
  })

  it('takes the app name off page titles', () => {
    expect(pageTitle('Fixed costs · Hearthside')).toBe('Fixed costs')
    expect(pageTitle('Hearthside')).toBeUndefined()
  })
})

describe('storage', () => {
  beforeEach(() => sessionStorage.clear())

  it('round-trips the trail and ignores junk', () => {
    expect(readTrail()).toEqual([])
    writeTrail([{ url: '/', steps: 1 }])
    expect(readTrail()).toEqual([{ url: '/', steps: 1 }])
    sessionStorage.setItem('hs-trail', '{bad')
    expect(readTrail()).toEqual([])
  })

  it('reads a tab reset once', () => {
    expect(takeReset()).toBe(false)
    markReset()
    expect(takeReset()).toBe(true)
    expect(takeReset()).toBe(false)
  })
})
