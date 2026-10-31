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
 * Colors are read from each provider's logo file (see apps/web/public/logos/SOURCES.md).
 * `approx` marks the ones without a logo file to confirm them.
 */
export const BRANDS: Record<ProviderId, Brand & { approx?: true }> = {
  // Banks
  hapoalim: { color: '#F0000B', accent: '#525252', mono: 'H' },
  leumi: { color: '#10069A', accent: '#0066FF', mono: 'L' },
  mizrahi: { color: '#F87D28', accent: '#3D444B', mono: 'MT' },
  discount: { color: '#59AD29', accent: '#2E6B12', mono: 'D' },
  fibi: { color: '#00529B', accent: '#FDB726', mono: 'FI' },
  mercantile: { color: '#00A661', accent: '#00663B', mono: 'M' },
  jerusalem: { color: '#FAA819', accent: '#424245', mono: 'J' },
  yahav: { color: '#2D5998', accent: '#4CB245', mono: 'Y' },
  massad: { color: '#5B2C83', accent: '#A779D9', mono: 'MS', approx: true },
  onezero: { color: '#141414', accent: '#6E6E6E', mono: '10' },
  // Cards
  max: { color: '#141414', accent: '#6E6E6E', mono: 'max' },
  cal: { color: '#1E5CB3', accent: '#7FA7E0', mono: 'cal' },
  isracard: { color: '#0C1419', accent: '#4A5A66', mono: 'IC' },
  amex: { color: '#016FD0', accent: '#00175A', mono: 'AX' },
  diners: { color: '#0079BE', accent: '#211E1F', mono: 'DC' },
}

/** Brokers, investment houses and pension funds. Free-text provider names map to these. */
export const BROKERS = {
  ibkr: {
    label: 'Interactive Brokers',
    match: /interactive\s*brokers|\bibkr\b|אינטראקטיב/i,
    brand: { color: '#D81222', accent: '#960B1A', mono: 'IB' },
  },
  etoro: {
    label: 'eToro',
    match: /e-?toro|איטורו/i,
    brand: { color: '#6DFF8A', accent: '#1F7A35', mono: 'eT' },
  },
  schwab: {
    label: 'Charles Schwab',
    match: /schwab/i,
    brand: { color: '#00A0DF', accent: '#005A87', mono: 'CS' },
  },
  meitav: {
    label: 'Meitav',
    match: /meitav|מיטב/i,
    brand: { color: '#3F1C51', accent: '#36B778', mono: 'Mt' },
  },
  altshuler: {
    label: 'Altshuler Shaham',
    match: /altshuler|אלטשולר/i,
    brand: { color: '#007040', accent: '#1C1C1C', mono: 'AS' },
  },
  psagot: {
    label: 'Psagot',
    match: /psagot|פסגות/i,
    brand: { color: '#393981', accent: '#1F1F71', mono: 'Ps' },
  },
  more: {
    label: 'More',
    match: /\bmore\s+(investment|invest|gemel|provident)|מור (השקעות|גמל)/i,
    brand: { color: '#0F3D66', accent: '#63C7C9', mono: 'Mo' },
  },
  excellence: {
    label: 'Excellence',
    match: /excellence|אקסלנס/i,
    brand: { color: '#003D7D', accent: '#7FA7D6', mono: 'Ex', approx: true },
  },
  ibi: {
    label: 'IBI',
    match: /\bibi\b|אי\.?בי\.?אי/i,
    brand: { color: '#161932', accent: '#5A5F8A', mono: 'IBI' },
  },
  migdal: {
    label: 'Migdal',
    match: /migdal|מגדל/i,
    brand: { color: '#3C65E3', accent: '#020140', mono: 'Mg' },
  },
  harel: {
    label: 'Harel',
    match: /harel|הראל/i,
    brand: { color: '#0088C9', accent: '#2D9D3A', mono: 'Hr' },
  },
  clal: {
    label: 'Clal',
    match: /\bclal\b|כלל ביטוח|כלל פנסיה|כלל גמל/i,
    brand: { color: '#507CF3', accent: '#2C2A33', mono: 'Cl' },
  },
  phoenix: {
    label: 'Phoenix',
    match: /phoenix|הפניקס/i,
    brand: { color: '#232873', accent: '#FF5A23', mono: 'Ph' },
  },
  menora: {
    label: 'Menora Mivtachim',
    match: /menora|מנורה/i,
    brand: { color: '#C8102E', accent: '#003865', mono: 'Mn', approx: true },
  },
  analyst: {
    label: 'Analyst',
    match: /analyst|אנליסט/i,
    brand: { color: '#1E1C55', accent: '#5A93CE', mono: 'An' },
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

/** Free-text names for banks and cards, e.g. an investment account kept at a bank. */
const PROVIDER_MATCH: Record<ProviderId, RegExp> = {
  hapoalim: /hapoalim|poalim|הפועלים/i,
  leumi: /leumi|(?<!בינ)לאומי/i,
  mizrahi: /mizrahi|tefahot|מזרחי|טפחות/i,
  discount: /discount|דיסקונט/i,
  fibi: /\bfibi\b|first\s+international|הבינלאומי/i,
  mercantile: /mercantile|מרכנתיל/i,
  jerusalem: /bank\s+of\s+jerusalem|jerusalem\s+bank|בנק ירושלים/i,
  yahav: /\byahav\b|בנק יהב/i,
  massad: /\bmassad\b|בנק מסד/i,
  onezero: /one\s*zero|וואן זירו/i,
  max: /^max\b|מקס/i,
  cal: /^cal\b|כאל/i,
  isracard: /isracard|ישראכרט/i,
  amex: /american\s+express|\bamex\b|אמריקן אקספרס/i,
  diners: /diners|דיינרס/i,
}

/** Any known brand a free-text provider name refers to: brokers first, then banks and cards. */
export function brandFromText(text: string | null | undefined): BrandId | null {
  if (!text) return null
  if (isBrandId(text)) return text
  const broker = brokerFromText(text)
  if (broker) return broker
  for (const [id, re] of Object.entries(PROVIDER_MATCH)) if (re.test(text)) return id as ProviderId
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

/** The color itself, or the nearest darker shade that text can sit on (4.5:1). */
export function readable(hex: string): string {
  for (let t = 0; t < 1; t += 0.04) {
    const c = shade(hex, -t)
    if (contrastRatio(c, inkOn(c)) >= 4.5) return c
  }
  return '#000000'
}

export interface AccountLook {
  /** Provider label, when the provider is known. */
  label: string | null
  /** The known brand id, when there is one. */
  brand: BrandId | null
  mono: string
  color: string | null
  /** `color`, darkened just enough for text: the card face and badge background. */
  face: string | null
  /** Darker end of the card gradient; text on it still reads with `ink`. */
  deep: string | null
  /** Decorative second color. */
  accent: string | null
  /** Text color on `face` and `deep`. */
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
  const id = brandFromText(account.provider)
  const brand = id ? brandOf(id) : null
  const own = normalizeHexColor(account.color)
  const color = own ?? brand?.color ?? null
  const accent = own ? shade(own, 0.35) : (brand?.accent ?? null)
  const face = color ? readable(color) : null
  const ink = face ? inkOn(face) : null
  // Light faces carry dark text, so their gradient only darkens a little.
  const deep = face ? shade(face, ink === LIGHT_INK ? -0.3 : -0.12) : null
  return {
    label: brand?.label ?? null,
    brand: id,
    mono: brand?.mono ?? monogram(account.name),
    color,
    face,
    deep,
    accent,
    ink,
    custom: own !== null,
  }
}
