import type { Minor } from '../money'

/** Excel stores dates as days since 1899-12-30. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

function iso(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += y < 70 ? 2000 : 1900
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return undefined
  if (y < 1990 || y > 2100) return undefined
  return date.toISOString().slice(0, 10)
}

/** A calendar date as YYYY-MM-DD. Day comes before month, as in Israeli exports. */
export function parseDate(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(v)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(v)
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const serial = Math.floor(Number(v))
    if (serial < 30000 || serial > 75000) return undefined
    return new Date(EXCEL_EPOCH + serial * 86_400_000).toISOString().slice(0, 10)
  }
  return undefined
}

/** Amount text to integer minor units. Accepts "1,234.50", "₪ -12", "12.30-", "(12.30)". */
export function parseAmount(value: string): Minor | undefined {
  let v = value.replace(/[‎‏‪-‮ \s]/g, '').replace(/ש"ח|ש״ח|nis|ils|[₪$€£]/gi, '')
  if (!v) return undefined
  let negative = false
  if (/^\(.*\)$/.test(v)) {
    negative = true
    v = v.slice(1, -1)
  }
  if (v.endsWith('-')) {
    negative = !negative
    v = v.slice(0, -1)
  }
  if (v.startsWith('-') || v.startsWith('−')) {
    negative = !negative
    v = v.slice(1)
  } else if (v.startsWith('+')) v = v.slice(1)
  v = v.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(v)) return undefined
  const minor = Math.round(Number(v) * 100)
  if (!Number.isSafeInteger(minor)) return undefined
  return negative ? -minor : minor
}

export interface Installment {
  n: number
  total: number
}

/** "תשלום 2 מתוך 6", "2 מתוך 6", "2/6", "payment 2 of 6". */
export function parseInstallment(value: string): Installment | undefined {
  const m = /(\d{1,3})\s*(?:מתוך|\/|of|מ-)\s*(\d{1,3})/i.exec(value)
  if (!m) return undefined
  const n = Number(m[1])
  const total = Number(m[2])
  if (n < 1 || total < 2 || n > total) return undefined
  return { n, total }
}

const CURRENCY_ALIASES: Record<string, string> = {
  '₪': 'ILS',
  'ש"ח': 'ILS',
  'ש״ח': 'ILS',
  שח: 'ILS',
  nis: 'ILS',
  $: 'USD',
  דולר: 'USD',
  '€': 'EUR',
  אירו: 'EUR',
  יורו: 'EUR',
  '£': 'GBP',
  'ליש"ט': 'GBP',
}

export function parseCurrency(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  const alias = CURRENCY_ALIASES[v.toLowerCase()]
  if (alias) return alias
  return /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : undefined
}

/** Description as matched for duplicates and category rules. */
export function normalizeDescription(value: string): string {
  return value.normalize('NFKC').replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}
