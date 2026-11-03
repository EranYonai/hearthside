/**
 * Local mutual funds, as the local exchange's fund data service lists them: names, how the fund
 * is classified, how much of it is in shares and in foreign currency, and what it holds. The
 * public quote feed knows little or nothing about these funds.
 */
export interface LocalFund {
  /** The fund number, as members type it. */
  id: string
  name: string | null
  longName: string | null
  /** Broad to narrow, e.g. ["Equity", "Israel", "Tel Aviv 125"]. */
  classification: string[]
  /** The raw exposure profile, e.g. "4D": shares level then foreign currency level. */
  exposure: string | null
  /** What the profile means, when the service explains its codes. */
  shareExposure: string | null
  currencyExposure: string | null
  underlying: string[]
  types: string[]
  isin: string | null
}

const text = (v: unknown, max = 120) =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null

/** A `{ code, value }` pair's text, or a plain string. */
const valueOf = (v: unknown): string | null =>
  typeof v === 'string'
    ? text(v)
    : v && typeof v === 'object'
      ? text((v as { value?: unknown }).value)
      : null

/** Values from a list of pairs, a single pair, or a wrapped `{ <name>: { result: [...] } }`. */
function values(v: unknown): string[] {
  if (Array.isArray(v)) return [...new Set(v.flatMap((x) => values(x)))]
  if (v && typeof v === 'object') {
    const one = valueOf(v)
    if (one) return [one]
    // Some answers nest the list one level down.
    return Object.values(v as Record<string, unknown>).flatMap((inner) =>
      inner && typeof inner === 'object' && Array.isArray((inner as { result?: unknown }).result)
        ? values((inner as { result: unknown[] }).result)
        : [],
    )
  }
  const s = valueOf(v)
  return s ? [s] : []
}

/** The `result` list of an answer shaped `{ <name>: { result: [...] } }`. */
function resultOf(body: unknown, name: string): unknown[] {
  const wrapper = (body as Record<string, unknown> | null)?.[name] as
    { result?: unknown } | undefined
  if (!wrapper || typeof wrapper !== 'object') throw new Error(`${name}: unexpected answer`)
  return Array.isArray(wrapper.result) ? wrapper.result : []
}

/** Read a `{ <name>: { result: [{ code, value }] } }` answer into code -> meaning. */
export function parseCodeList(body: unknown, name: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const item of resultOf(body, name)) {
    const { code, value } = (item ?? {}) as { code?: unknown; value?: unknown }
    const meaning = text(value)
    if ((typeof code === 'string' || typeof code === 'number') && meaning)
      out.set(String(code).trim().toUpperCase(), meaning)
  }
  return out
}

/**
 * Read the fund list: `{ funds: { result: [{ fundId, fundName, fundLongName,
 * classificationMajor, classificationMain, classificationSecondary, exposureProfile, isin,
 * underlyingAsset, fundType }] } }`. Shares and currency code lists explain the profile.
 */
export function parseFundList(
  body: unknown,
  codes: { shares?: ReadonlyMap<string, string>; currencies?: ReadonlyMap<string, string> } = {},
): Map<string, LocalFund> {
  const out = new Map<string, LocalFund>()
  for (const item of resultOf(body, 'funds')) {
    const f = (item ?? {}) as Record<string, unknown>
    const id =
      typeof f.fundId === 'number' && Number.isInteger(f.fundId)
        ? String(f.fundId)
        : typeof f.fundId === 'string'
          ? f.fundId.trim()
          : ''
    if (!/^\d+$/.test(id)) continue
    const exposure = text(f.exposureProfile, 8)?.toUpperCase() ?? null
    const [, shares, currency] = exposure?.match(/^(\d*)([A-Z]*)$/) ?? []
    const isin = text(f.isin, 12)
    out.set(id.replace(/^0+(?=\d)/, ''), {
      id,
      name: text(f.fundName),
      longName: text(f.fundLongName),
      classification: [
        valueOf(f.classificationMajor),
        valueOf(f.classificationMain),
        valueOf(f.classificationSecondary),
      ].filter((v): v is string => !!v),
      exposure,
      shareExposure: (shares && codes.shares?.get(shares)) || null,
      currencyExposure: (currency && codes.currencies?.get(currency)) || null,
      underlying: values(f.underlyingAsset).slice(0, 6),
      types: values(f.fundType).slice(0, 4),
      isin: isin && /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin : null,
    })
  }
  return out
}

/** Find a fund by the number a member typed, ignoring leading zeros. */
export function findLocalFund(funds: ReadonlyMap<string, LocalFund>, symbol: string) {
  const id = symbol.trim()
  return /^\d+$/.test(id) ? (funds.get(id.replace(/^0+(?=\d)/, '')) ?? null) : null
}
