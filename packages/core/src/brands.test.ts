import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SWATCHES,
  BRAND_IDS,
  BRANDS,
  BROKERS,
  MAX_LOGO_BYTES,
  brandOf,
  brokerFromText,
  parseLogoDataUrl,
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
    const colors = [...BRAND_IDS.map((id) => brandOf(id).color), ...ACCOUNT_SWATCHES]
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

  it('recognizes brokers from free text, in English and Hebrew', () => {
    expect(brokerFromText('Interactive Brokers')).toBe('ibkr')
    expect(brokerFromText('IBKR margin')).toBe('ibkr')
    expect(brokerFromText('מיטב טרייד')).toBe('meitav')
    expect(brokerFromText('ibkr')).toBe('ibkr')
    expect(brokerFromText('More money than ever')).toBeNull()
    expect(brokerFromText('')).toBeNull()
    expect(brokerFromText(null)).toBeNull()
    for (const b of Object.values(BROKERS)) expect(b.brand.mono.length).toBeLessThanOrEqual(3)

    const look = accountLook({ name: 'Long term', provider: 'Interactive Brokers' })
    expect(look).toMatchObject({ brand: 'ibkr', label: 'Interactive Brokers', mono: 'IB' })
    expect(brandOf('leumi')).toMatchObject({ kind: 'bank', label: 'Leumi' })
  })

  it('accepts only small PNG, JPEG or WebP logos', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    const ok = `data:image/png;base64,${b64(png)}`
    expect(parseLogoDataUrl(ok)).toBe(ok)
    const jpeg = `data:image/jpeg;base64,${b64(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))}`
    expect(parseLogoDataUrl(jpeg)).toBe(jpeg)
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
    expect(parseLogoDataUrl(`data:image/webp;base64,${b64(webp)}`)).not.toBeNull()

    // Wrong magic bytes, SVG, other schemes, junk and oversized files are refused.
    expect(parseLogoDataUrl(`data:image/jpeg;base64,${b64(png)}`)).toBeNull()
    expect(parseLogoDataUrl(`data:image/svg+xml;base64,${btoa('<svg/>')}`)).toBeNull()
    expect(parseLogoDataUrl('https://example.com/logo.png')).toBeNull()
    expect(parseLogoDataUrl('data:image/png;base64,***')).toBeNull()
    expect(parseLogoDataUrl(42)).toBeNull()
    const big = new Uint8Array(MAX_LOGO_BYTES + 10)
    big.set(png)
    let s = ''
    for (const c of big) s += String.fromCharCode(c)
    expect(parseLogoDataUrl(`data:image/png;base64,${btoa(s)}`)).toBeNull()
  })
})
