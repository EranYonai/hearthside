import { PROVIDERS, isProviderId, type ProviderId } from './import/detect'

/**
 * How an account looks: a color and a short monogram per provider. We never ship provider
 * logos (they're trademarks); a color plus initials is enough to tell accounts apart at a
 * glance. People can override the color per account.
 */
export interface Brand {
  /** Main brand color, used as the card face or the bank stripe. */
  color: string
  /** Second brand color, for decoration only (text never sits on it). */
  accent: string
  /** One to three characters shown in the badge. */
  mono: string
}

/**
 * Colors are taken from each provider's public logo and rounded to the nearest clean value.
 * `approx` marks the ones we couldn't confirm from a primary source.
 */
export const BRANDS: Record<ProviderId, Brand & { approx?: true }> = {
  // Banks
  hapoalim: { color: '#E30520', accent: '#9E0015', mono: 'H' },
  leumi: { color: '#0C4DA2', accent: '#00AEEF', mono: 'L' },
  mizrahi: { color: '#F5821F', accent: '#4D555A', mono: 'MT' },
  discount: { color: '#00763A', accent: '#7AC143', mono: 'D' },
  fibi: { color: '#002F6C', accent: '#C9A227', mono: 'FI', approx: true },
  mercantile: { color: '#00539B', accent: '#00A0DF', mono: 'M', approx: true },
  jerusalem: { color: '#1D3F8F', accent: '#5B8DEF', mono: 'J', approx: true },
  yahav: { color: '#00609C', accent: '#00A9CE', mono: 'Y', approx: true },
  massad: { color: '#5B2C83', accent: '#A779D9', mono: 'MS', approx: true },
  onezero: { color: '#141414', accent: '#6E56CF', mono: '10', approx: true },
  // Cards
  max: { color: '#D6006F', accent: '#5B1A8C', mono: 'max', approx: true },
  cal: { color: '#00B6AD', accent: '#0A4573', mono: 'cal' },
  isracard: { color: '#042A59', accent: '#C51115', mono: 'IC' },
  amex: { color: '#006FCF', accent: '#00175A', mono: 'AX' },
  diners: { color: '#004A97', accent: '#7FA7D6', mono: 'DC', approx: true },
}

/** Brokers, investment houses and pension funds. Free-text provider names map to these. */
export const BROKERS = {
  ibkr: {
    label: 'Interactive Brokers',
    match: /interactive\s*brokers|\bibkr\b|אינטראקטיב/i,
    brand: { color: '#D81222', accent: '#7A0A13', mono: 'IB' },
  },
  etoro: {
    label: 'eToro',
    match: /e-?toro|איטורו/i,
    brand: { color: '#0E7F2A', accent: '#0B5E20', mono: 'eT', approx: true },
  },
  schwab: {
    label: 'Charles Schwab',
    match: /schwab/i,
    brand: { color: '#00A0DF', accent: '#005A87', mono: 'CS', approx: true },
  },
  meitav: {
    label: 'Meitav',
    match: /meitav|מיטב/i,
    brand: { color: '#00828C', accent: '#7FD1D6', mono: 'Mt', approx: true },
  },
  altshuler: {
    label: 'Altshuler Shaham',
    match: /altshuler|אלטשולר/i,
    brand: { color: '#C8102E', accent: '#5E0716', mono: 'AS', approx: true },
  },
  psagot: {
    label: 'Psagot',
    match: /psagot|פסגות/i,
    brand: { color: '#0B3B8C', accent: '#4F8BE0', mono: 'Ps', approx: true },
  },
  more: {
    label: 'More',
    match: /\bmore\s+(investment|invest|gemel|provident)|מור (השקעות|גמל)/i,
    brand: { color: '#C2401B', accent: '#7A2A14', mono: 'Mo', approx: true },
  },
  excellence: {
    label: 'Excellence',
    match: /excellence|אקסלנס/i,
    brand: { color: '#003D7D', accent: '#7FA7D6', mono: 'Ex', approx: true },
  },
  ibi: {
    label: 'IBI',
    match: /\bibi\b|אי\.?בי\.?אי/i,
    brand: { color: '#1F2A44', accent: '#6C7BA0', mono: 'IBI', approx: true },
  },
  migdal: {
    label: 'Migdal',
    match: /migdal|מגדל/i,
    brand: { color: '#0033A0', accent: '#6F8FD6', mono: 'Mg', approx: true },
  },
  harel: {
    label: 'Harel',
    match: /harel|הראל/i,
    brand: { color: '#0058A3', accent: '#00A3E0', mono: 'Hr', approx: true },
  },
  clal: {
    label: 'Clal',
    match: /\bclal\b|כלל ביטוח|כלל פנסיה|כלל גמל/i,
    brand: { color: '#00818A', accent: '#7FCCD1', mono: 'Cl', approx: true },
  },
  phoenix: {
    label: 'Phoenix',
    match: /phoenix|הפניקס/i,
    brand: { color: '#B84303', accent: '#7A2C02', mono: 'Ph', approx: true },
  },
  menora: {
    label: 'Menora Mivtachim',
    match: /menora|מנורה/i,
    brand: { color: '#C8102E', accent: '#003865', mono: 'Mn', approx: true },
  },
  analyst: {
    label: 'Analyst',
    match: /analyst|אנליסט/i,
    brand: { color: '#5B2C83', accent: '#A779D9', mono: 'An', approx: true },
  },
} as const satisfies Record<
  string,
  { label: string; match: RegExp; brand: Brand & { approx?: true } }
>

export type BrokerId = keyof typeof BROKERS
export type BrandId = ProviderId | BrokerId
export type BrandKind = 'bank' | 'card' | 'broker'

export function isBrokerId(id: unknown): id is BrokerId {
  return typeof id === 'string' && Object.hasOwn(BROKERS, id)
}

export function isBrandId(id: unknown): id is BrandId {
  return isProviderId(id) || isBrokerId(id)
}

/** The broker a free-text provider name refers to, if we know it. */
export function brokerFromText(text: string | null | undefined): BrokerId | null {
  if (!text) return null
  if (isBrokerId(text)) return text
  for (const [id, b] of Object.entries(BROKERS)) if (b.match.test(text)) return id as BrokerId
  return null
}

export function brandOf(id: BrandId): Brand & { label: string; kind: BrandKind; approx?: true } {
  if (isBrokerId(id)) return { ...BROKERS[id].brand, label: BROKERS[id].label, kind: 'broker' }
  return { ...BRANDS[id], label: PROVIDERS[id].label, kind: PROVIDERS[id].kind }
}

/** Every brand, for pickers and the logo settings. */
export const BRAND_IDS: readonly BrandId[] = [
  ...(Object.keys(PROVIDERS) as ProviderId[]),
  ...(Object.keys(BROKERS) as BrokerId[]),
]

/** Swatches offered when someone picks their own color. */
export const ACCOUNT_SWATCHES = [
  '#E30520',
  '#F5821F',
  '#E8B100',
  '#00763A',
  '#00B6AD',
  '#0C4DA2',
  '#5B2C83',
  '#D6006F',
  '#6B4F3A',
  '#3B3F46',
] as const

const HEX = /^#[0-9a-f]{6}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/** "#abcdef", or null for anything that isn't a six-digit hex color. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  const v = value?.trim()
  return isHexColor(v) ? v.toUpperCase() : null
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase()
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const LIGHT_INK = '#FFFFFF'
const DARK_INK = '#1A1410'

/** Text color that reads best on every one of `backgrounds` (its worst case wins). */
export function inkOn(...backgrounds: string[]): string {
  const worst = (ink: string) => Math.min(...backgrounds.map((b) => contrastRatio(b, ink)))
  return worst(LIGHT_INK) >= worst(DARK_INK) ? LIGHT_INK : DARK_INK
}

/** Mix toward black (amount < 0) or white (amount > 0); amount is -1..1. */
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255
  const t = Math.min(1, Math.abs(amount))
  return toHex(channels(hex).map((c) => c + (target - c) * t))
}

export interface AccountLook {
  /** Provider label, when the provider is known. */
  label: string | null
  /** The known brand id, when there is one. */
  brand: BrandId | null
  mono: string
  color: string | null
  /** Darker end of the card gradient; text on it still reads with `ink`. */
  deep: string | null
  /** Decorative second color. */
  accent: string | null
  /** Text color on `color` and `deep`. */
  ink: string | null
  /** True when the color came from the person, not the provider. */
  custom: boolean
}

/** Initials from an account name, for accounts without a known provider. */
export function monogram(name: string): string {
  const words = name
    .replace(/[·•\d]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const letters = words.slice(0, 2).map((w) => [...w][0]!.toUpperCase())
  return letters.join('') || '•'
}

/**
 * Everything the UI needs to draw an account: the person's own color wins over the provider's,
 * and accounts with neither stay neutral (color null).
 */
export function accountLook(account: {
  name: string
  provider?: string | null
  color?: string | null
}): AccountLook {
  const id = isBrandId(account.provider) ? account.provider : brokerFromText(account.provider)
  const brand = id ? brandOf(id) : null
  const own = normalizeHexColor(account.color)
  const color = own ?? brand?.color ?? null
  const accent = own ? shade(own, 0.35) : (brand?.accent ?? null)
  const deep = color ? shade(color, -0.3) : null
  return {
    label: brand?.label ?? null,
    brand: id,
    mono: brand?.mono ?? monogram(account.name),
    color,
    deep,
    accent,
    ink: color && deep ? inkOn(color, deep) : null,
    custom: own !== null,
  }
}

/** Largest logo we keep, in bytes after decoding. Uploads are resized well below this. */
export const MAX_LOGO_BYTES = 64 * 1024

const LOGO_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
}

/**
 * A logo as a `data:` URL, checked to really be a small PNG, JPEG or WebP. SVG is refused,
 * since it can carry scripts. Returns null when the value isn't acceptable.
 */
export function parseLogoDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!m) return null
  const [, type, data] = m as unknown as [string, string, string]
  if ((data.length * 3) / 4 > MAX_LOGO_BYTES + 3) return null
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null
  return LOGO_TYPES[type]!(bytes) ? value : null
}
