/** Money is stored as integer minor units (agorot) to avoid float drift. */
export type Minor = number

export type Direction = 'in' | 'out'

export interface FormatOptions {
  locale?: string
  currency?: string
  /** Round to whole units, for summaries. Rows keep the minor units. */
  whole?: boolean
  /** Prefix a sign: U+2212 for money out, + for money in. */
  signed?: boolean
}

export const MINUS = '−'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(locale: string, currency: string, whole: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${whole}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
    formatters.set(key, f)
  }
  return f
}

export function direction(minor: Minor): Direction {
  return minor < 0 ? 'out' : 'in'
}

/**
 * Format an amount the Hearthside way: `−₪412.30` for money out (true minus sign),
 * `+₪16,200` for money in when signed, plain `₪6,820` otherwise.
 */
export function formatMoney(minor: Minor, options: FormatOptions = {}): string {
  const { locale = 'en-IL', currency = 'ILS', whole = false, signed = false } = options
  if (!Number.isInteger(minor)) throw new TypeError('Amounts must be integer minor units')
  const value = Math.abs(minor) / 100
  const body = formatter(locale, currency, whole).format(whole ? Math.round(value) : value)
  if (minor < 0) return `${MINUS}${body}`
  if (signed && minor > 0) return `+${body}`
  return body
}

/** Screen-reader label that states direction, e.g. "spent 412 shekels 30". */
export function moneyLabel(minor: Minor, currency = 'ILS'): string {
  const abs = Math.abs(minor)
  if (currency !== 'ILS')
    return `${minor < 0 ? 'spent' : 'received'} ${formatMoney(abs, { currency })}`
  const units = Math.floor(abs / 100)
  const cents = abs % 100
  const verb = minor < 0 ? 'spent' : 'received'
  const unitWord = units === 1 ? 'shekel' : 'shekels'
  return cents === 0 ? `${verb} ${units} ${unitWord}` : `${verb} ${units} ${unitWord} ${cents}`
}
