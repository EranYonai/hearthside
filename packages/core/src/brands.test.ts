import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SWATCHES,
  BRANDS,
  accountLook,
  contrastRatio,
  inkOn,
  isHexColor,
  monogram,
  normalizeHexColor,
  shade,
} from './brands'
import { PROVIDERS, isProviderId, providerLabel } from './import/detect'

describe('brands', () => {
  it('has a look for every provider, with valid colors and short monograms', () => {
    expect(Object.keys(BRANDS).sort()).toEqual(Object.keys(PROVIDERS).sort())
    for (const brand of Object.values(BRANDS)) {
      expect(isHexColor(brand.color)).toBe(true)
      expect(isHexColor(brand.accent)).toBe(true)
      expect(brand.mono.length).toBeGreaterThan(0)
      expect(brand.mono.length).toBeLessThanOrEqual(3)
    }
  })

  it('keeps card text readable on every brand color and swatch', () => {
    const colors = [...Object.values(BRANDS).map((b) => b.color), ...ACCOUNT_SWATCHES]
    for (const color of colors) {
      const look = accountLook({ name: 'x', color })
      expect(contrastRatio(look.color!, look.ink!)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(look.deep!, look.ink!)).toBeGreaterThanOrEqual(3)
    }
  })

  it('validates and normalizes hex colors', () => {
    expect(normalizeHexColor(' #00b6ad ')).toBe('#00B6AD')
    expect(normalizeHexColor('#fff')).toBeNull()
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('#00b6ad; background:url(x)')).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
    expect(isProviderId('max')).toBe(true)
    expect(isProviderId('toString')).toBe(false)
    expect(providerLabel('constructor')).toBeNull()
  })

  it('picks light ink on dark colors and dark ink on light ones', () => {
    expect(inkOn('#042A59')).toBe('#FFFFFF')
    expect(inkOn('#FFE680')).toBe('#1A1410')
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
  })

  it('shades toward black and white', () => {
    expect(shade('#808080', -1)).toBe('#000000')
    expect(shade('#808080', 1)).toBe('#FFFFFF')
    expect(shade('#808080', 0)).toBe('#808080')
  })

  it('uses the provider look, lets a custom color win, and stays neutral otherwise', () => {
    const cal = accountLook({ name: 'Cal ·1234', provider: 'cal' })
    expect(cal).toMatchObject({ label: 'Cal', mono: 'cal', color: BRANDS.cal.color, custom: false })

    const own = accountLook({ name: 'Cal ·1234', provider: 'cal', color: '#5b2c83' })
    expect(own).toMatchObject({ label: 'Cal', mono: 'cal', color: '#5B2C83', custom: true })

    const plain = accountLook({ name: 'Joint savings', provider: 'nope', color: 'bad' })
    expect(plain).toMatchObject({ label: null, mono: 'JS', color: null, ink: null })
  })

  it('makes initials from names, skipping digits and separators', () => {
    expect(monogram('Bank account ·5678')).toBe('BA')
    expect(monogram('wallet')).toBe('W')
    expect(monogram('1234')).toBe('•')
  })
})
