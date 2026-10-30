import { normalizeHeader } from './columns'
import type { ParsedStatement } from './statement'
import type { Sheet } from './table'

export const PROVIDERS = {
  max: { label: 'Max', kind: 'card' },
  cal: { label: 'Cal', kind: 'card' },
  isracard: { label: 'Isracard', kind: 'card' },
  amex: { label: 'American Express', kind: 'card' },
  hapoalim: { label: 'Hapoalim', kind: 'bank' },
  leumi: { label: 'Leumi', kind: 'bank' },
  discount: { label: 'Discount', kind: 'bank' },
  mizrahi: { label: 'Mizrahi Tefahot', kind: 'bank' },
} as const

export type ProviderId = keyof typeof PROVIDERS
export type SourceKind = 'card' | 'bank'
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'diners' | 'isracard'

export interface DetectedSource {
  provider: ProviderId | null
  kind: SourceKind
  network: CardNetwork | null
  /** Last four digits of the card or account number, when the file shows them. */
  last4: string | null
}

export function providerLabel(id: string | null | undefined): string | null {
  return id && id in PROVIDERS ? PROVIDERS[id as ProviderId].label : null
}

/** "Max ·1234", "Hapoalim account ·5678", "Card". */
export function suggestAccountName(source: Pick<DetectedSource, 'provider' | 'kind' | 'last4'>) {
  const label = providerLabel(source.provider)
  const base = label
    ? source.kind === 'bank'
      ? `${label} account`
      : label
    : source.kind === 'bank'
      ? 'Bank account'
      : 'Card'
  return source.last4 ? `${base} ·${source.last4}` : base
}

const NETWORKS: [RegExp, CardNetwork][] = [
  [/מאסטרקארד|mastercard|master card/i, 'mastercard'],
  [/ויזה|visa/i, 'visa'],
  [/אמריקן אקספרס|american express|amex/i, 'amex'],
  [/דיינרס|diners/i, 'diners'],
  [/ישראכרט|isracard/i, 'isracard'],
]

/** Text that names a source: file name, title rows above the first table, sheet names. */
function preambleText(
  sheets: readonly Sheet[],
  parsed: ParsedStatement | undefined,
  fileName: string,
) {
  const parts = [fileName]
  for (const sheet of sheets) {
    parts.push(sheet.name)
    const headerRow = parsed?.tables.find((t) => t.sheet === sheet.name)?.headerRow ?? 15
    for (const row of sheet.rows.slice(0, Math.min(headerRow - 1, 15)))
      parts.push(row.filter(Boolean).join(' '))
  }
  return parts.join('\n')
}

function headerSet(parsed: ParsedStatement | undefined): Set<string> {
  return new Set(
    parsed?.tables.flatMap((t) => t.headers.map((h) => normalizeHeader(h ?? ''))) ?? [],
  )
}

function lastFour(digits: string): string | null {
  const only = digits.replace(/\D/g, '')
  return only.length >= 4 ? only.slice(-4) : null
}

/**
 * Guess where a statement comes from: provider, card or bank account, card network, and
 * the last four digits. Everything here is a hint the person can change before importing.
 */
export function detectSource(
  sheets: readonly Sheet[],
  parsed: ParsedStatement | undefined,
  fileName = '',
): DetectedSource {
  const text = preambleText(sheets, parsed, fileName)
  const headers = headerSet(parsed)
  const has = (...names: string[]) => names.every((n) => headers.has(normalizeHeader(n)))

  let provider: ProviderId | null = null
  if (/transaction-details_export/i.test(fileName) || has('מפתח דיסקונט') || has('מועדון הנחות'))
    provider = 'max'
  else if (/פירוט חיובים לכרטיס/.test(text) || has('ענף', 'שם בית עסק')) provider = 'cal'
  else if (/אמריקן אקספרס|american express/i.test(text)) provider = 'amex'
  else if (/ישראכרט|isracard/i.test(text)) provider = 'isracard'
  else if (/current_account_operations|hapoalim|הפועלים/i.test(text)) provider = 'hapoalim'
  else if (/leumi|לאומי/i.test(text)) provider = 'leumi'
  else if (/mizrahi|מזרחי/i.test(text)) provider = 'mizrahi'
  else if (/bank discount|בנק דיסקונט/i.test(text)) provider = 'discount'

  const hasDebitCredit = parsed?.tables.some(
    (t) => t.columns.debit !== undefined || t.columns.credit !== undefined,
  )
  const kind: SourceKind = provider ? PROVIDERS[provider].kind : hasDebitCredit ? 'bank' : 'card'

  const network =
    kind === 'card'
      ? (NETWORKS.find(([re]) => re.test(text))?.[1] ?? (provider === 'amex' ? 'amex' : null))
      : null

  let last4: string | null = null
  if (kind === 'card') {
    const fromRows = parsed?.transactions.map((t) => t.last4).filter(Boolean) as
      string[] | undefined
    const distinct = new Set(fromRows)
    if (distinct.size === 1) last4 = [...distinct][0]!
    else if (distinct.size === 0) {
      const m = /(?:כרטיס|card|מאסטרקארד|ויזה|mastercard|visa)\D{0,30}?(\d{4})(?!\d)/i.exec(text)
      last4 = m?.[1] ?? null
    }
  } else {
    const m = /(?:account|חשבון)\D{0,20}?(\d[\d -]{4,}\d)/i.exec(text)
    last4 = m ? lastFour(m[1]!) : null
  }
  return { provider, kind, network, last4 }
}
