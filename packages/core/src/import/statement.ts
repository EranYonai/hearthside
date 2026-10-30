import type { Minor } from '../money'
import { fieldCount, isUsable, mapColumns, type ColumnMap } from './columns'
import type { Sheet } from './table'
import {
  normalizeDescription,
  parseAmount,
  parseCurrency,
  parseDate,
  parseInstallment,
  type Installment,
} from './values'

export interface ParsedTransaction {
  /** Purchase date, YYYY-MM-DD. */
  occurredOn: string
  /** Charge or value date, when the file has one. */
  postedOn?: string
  description: string
  /** Signed: negative is money out of the household. */
  amountMinor: Minor
  /** Foreign purchases: the amount in the original currency (unsigned). */
  original?: { minor: Minor; currency: string }
  installment?: Installment
  reference?: string
  notes?: string
  /** Last four digits of the card, when the file lists several cards. */
  last4?: string
  sheet: string
  /** 1-based row number in the sheet, for error messages. */
  row: number
}

export interface SkippedRow {
  sheet: string
  row: number
  reason: string
}

export interface ParseOptions {
  /**
   * Card statements list purchases as positive numbers. Set this so they become money out.
   * Bank statements with debit and credit columns ignore it.
   */
  spendingIsPositive: boolean
}

export interface ParsedStatement {
  transactions: ParsedTransaction[]
  skipped: SkippedRow[]
  /** Header row and columns of each table we found, for the preview. */
  tables: { sheet: string; headerRow: number; headers: string[]; columns: ColumnMap }[]
}

export class StatementError extends Error {}

const HEADER_SCAN = 40

function cell(row: readonly string[], col: number | undefined): string {
  return col === undefined ? '' : (row[col] ?? '').trim()
}

function looksLikeHeader(row: readonly string[]): ColumnMap | undefined {
  const map = mapColumns(row)
  return isUsable(map) && fieldCount(map) >= 3 ? map : undefined
}

function readRow(
  row: readonly string[],
  map: ColumnMap,
  options: ParseOptions,
): Omit<ParsedTransaction, 'sheet' | 'row'> | string {
  const occurredOn = parseDate(cell(row, map.date)) ?? parseDate(cell(row, map.postedDate))
  if (!occurredOn) return 'no date'
  const description = cell(row, map.description).replace(/\s+/g, ' ')
  if (!description) return 'no description'

  let amountMinor: Minor | undefined
  if (map.debit !== undefined || map.credit !== undefined) {
    const debit = parseAmount(cell(row, map.debit)) ?? 0
    const credit = parseAmount(cell(row, map.credit)) ?? 0
    if (cell(row, map.debit) || cell(row, map.credit))
      amountMinor = Math.abs(credit) - Math.abs(debit)
  }
  const currency = parseCurrency(cell(row, map.originalCurrency))
  const original = parseAmount(cell(row, map.originalAmount))
  if (amountMinor === undefined) {
    let charged = parseAmount(cell(row, map.amount))
    if (charged === undefined && original !== undefined && (!currency || currency === 'ILS'))
      charged = original
    if (charged !== undefined) amountMinor = options.spendingIsPositive ? -charged : charged
  }
  if (amountMinor === undefined) return 'no amount'

  const notes = cell(row, map.notes) || undefined
  const installment =
    parseInstallment(cell(row, map.installments)) ?? (notes ? parseInstallment(notes) : undefined)
  const postedOn = parseDate(cell(row, map.postedDate))
  const reference = cell(row, map.reference) || undefined
  const last4 = /(\d{4})\D*$/.exec(cell(row, map.last4))?.[1]
  return {
    occurredOn,
    ...(postedOn && postedOn !== occurredOn ? { postedOn } : {}),
    description,
    amountMinor,
    ...(original !== undefined && currency && currency !== 'ILS'
      ? { original: { minor: Math.abs(original), currency } }
      : {}),
    ...(installment ? { installment } : {}),
    ...(reference ? { reference } : {}),
    ...(notes ? { notes } : {}),
    ...(last4 ? { last4 } : {}),
  }
}

/**
 * Find transaction tables in the sheets and read their rows. A sheet can hold several
 * tables (for example local and foreign purchases); each new header row starts one.
 * Rows without a date or amount (titles, totals, blank lines) are skipped.
 */
export function parseStatement(
  sheets: readonly Sheet[],
  options: ParseOptions,
  override?: ColumnMap,
): ParsedStatement {
  const result: ParsedStatement = { transactions: [], skipped: [], tables: [] }
  for (const sheet of sheets) {
    let map: ColumnMap | undefined
    sheet.rows.forEach((row, i) => {
      if (!row.some((c) => c && c.trim())) return
      const header = looksLikeHeader(row)
      if (header && (map !== undefined || i < HEADER_SCAN || override)) {
        map = override ?? header
        result.tables.push({ sheet: sheet.name, headerRow: i + 1, headers: [...row], columns: map })
        return
      }
      if (!map) return
      const parsed = readRow(row, map, options)
      if (typeof parsed === 'string') {
        // Totals and section titles have no date; only report rows that look like data.
        if (parsed !== 'no date' || row.filter((c) => c && c.trim()).length >= 3)
          result.skipped.push({ sheet: sheet.name, row: i + 1, reason: parsed })
        return
      }
      result.transactions.push({ ...parsed, sheet: sheet.name, row: i + 1 })
    })
  }
  if (result.tables.length === 0)
    throw new StatementError(
      'Couldn’t find a table with a date, a description and an amount in this file.',
    )
  return result
}

/**
 * Stable keys for spotting the same transaction in overlapping files. An issuer reference
 * wins when the file has one. Identical rows in one file (two coffees, same day, same price)
 * are told apart by their order, so re-importing that file still matches them one to one.
 */
export function duplicateKeys(transactions: readonly ParsedTransaction[]): string[] {
  const seen = new Map<string, number>()
  return transactions.map((t) => {
    const inst = t.installment ? `${t.installment.n}/${t.installment.total}` : ''
    const base = t.reference
      ? `ref|${t.reference}|${inst}`
      : `${t.occurredOn}|${t.amountMinor}|${normalizeDescription(t.description)}|${inst}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}|${n}`
  })
}
