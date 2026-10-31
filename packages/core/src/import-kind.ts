import { BROKERS, brokerFromText, type BrokerId } from './brands'
import { HoldingsFormatError, parseHoldings, type HoldingsFile } from './holdings-import'
import { StatementError, parseStatement, type ParsedStatement, type Sheet } from './import'

/**
 * One import box takes every kind of file: a bank or card statement, or an investment
 * holdings export. This works out which one a file is, and for holdings, whose it is.
 */

export type ClassifiedFile =
  { type: 'statement'; probe: ParsedStatement } | { type: 'holdings'; holdings: HoldingsFile }

export class UnknownFileError extends Error {}

/**
 * A holdings export has a symbol (or security number) and a quantity per row; a statement
 * has a date, a description and an amount. When a file could be read both ways, the reading
 * that finds more rows wins, and a tie goes to the statement.
 */
export function classifyImport(sheets: readonly Sheet[], defaultCurrency = 'ILS'): ClassifiedFile {
  let probe: ParsedStatement | undefined
  let holdings: HoldingsFile | undefined
  try {
    probe = parseStatement(sheets, { spendingIsPositive: true })
  } catch (err) {
    if (!(err instanceof StatementError)) throw err
  }
  try {
    holdings = parseHoldings(sheets, defaultCurrency)
  } catch (err) {
    if (!(err instanceof HoldingsFormatError)) throw err
  }
  const statementRows = probe?.transactions.length ?? 0
  if (holdings && holdings.holdings.length > statementRows) return { type: 'holdings', holdings }
  if (probe) return { type: 'statement', probe }
  throw new UnknownFileError(
    'Couldn’t tell what this file is. A statement needs a date, a description and an amount on each row; a holdings file needs a symbol (or security number) and a quantity.',
  )
}

export interface DetectedBroker {
  broker: BrokerId | null
  /** Last four digits of the account number, when the file shows one. */
  last4: string | null
}

/**
 * Who runs the account a holdings file came from. Only the file name, the sheet names and
 * the rows above the table are read: fund names in the rows often name an investment house
 * that isn't the one holding them.
 */
export function detectBroker(
  sheets: readonly Sheet[],
  file: Pick<HoldingsFile, 'sheet' | 'headerRow'>,
  fileName = '',
): DetectedBroker {
  const parts = [fileName]
  for (const sheet of sheets) {
    parts.push(sheet.name)
    const above = sheet.name === file.sheet ? file.headerRow - 1 : 15
    for (const row of sheet.rows.slice(0, Math.min(above, 15)))
      parts.push(row.filter(Boolean).join(' '))
  }
  const text = parts.join('\n')
  const broker = brokerFromText(text)
  const m = /(?:account|חשבון)[^\dA-Za-z\n]{0,20}(?:[A-Za-z]{1,3})?(\d[\d -]{2,}\d)/i.exec(text)
  const digits = m?.[1]?.replace(/\D/g, '') ?? ''
  return { broker, last4: digits.length >= 4 ? digits.slice(-4) : null }
}

/** "Interactive Brokers ·1234", "Investments". */
export function suggestInvestmentName({ broker, last4 }: DetectedBroker): string {
  const base = broker ? BROKERS[broker].label : 'Investments'
  return last4 ? `${base} ·${last4}` : base
}

/** The currency most of the holdings are in, as the base currency of a new account. */
export function mainCurrency(file: HoldingsFile, fallback = 'ILS'): string {
  const counts = new Map<string, number>()
  for (const h of file.holdings)
    if (h.currency) counts.set(h.currency, (counts.get(h.currency) ?? 0) + 1)
  let best = fallback
  let most = 0
  for (const [ccy, n] of counts) if (n > most) [best, most] = [ccy, n]
  return best
}

/** The one investment account a file belongs to, among those the member may change. */
export function matchInvestmentAccount<
  A extends { id: string; name: string; provider: string | null },
>(accounts: readonly A[], detected: DetectedBroker): A | undefined {
  const same = accounts.filter(
    (a) => (brokerFromText(a.provider) ?? brokerFromText(a.name)) === detected.broker,
  )
  if (detected.last4) {
    const exact = same.find((a) => a.name.includes(detected.last4!))
    if (exact) return exact
    // A different account number at the same broker is a different account, unless the
    // existing one never said which number it was.
    return same.find((a) => !/\d{4}/.test(a.name))
  }
  return same[0]
}
