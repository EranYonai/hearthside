import { normalizeHeader, parseCurrency, type Sheet } from './import'
import {
  isHoldingCurrency,
  normalizeSymbol,
  parseDecimal,
  valueMinor,
  type AssetClass,
} from './invest'

/**
 * Reading a holdings export (Excel or CSV): one row per security with a symbol or security
 * number, a quantity, and usually a price, currency and market value. Layouts differ between
 * exporters, so columns are found by their header text.
 */

const HOLDING_FIELDS = ['symbol', 'name', 'units', 'price', 'currency', 'value'] as const
type HoldingField = (typeof HOLDING_FIELDS)[number]

const ALIASES: Record<HoldingField, string[]> = {
  symbol: [
    'symbol',
    'ticker',
    'security number',
    'security id',
    'isin',
    'מספר נייר',
    'מס נייר',
    'מספר ני"ע',
    'מספר ניע',
    'מס ניע',
    'מספר קרן',
  ],
  name: [
    'name',
    'security name',
    'description',
    'security',
    'שם נייר',
    'שם ניע',
    'שם הנייר',
    'שם קרן',
    'שם',
  ],
  units: ['quantity', 'units', 'shares', 'position', 'qty', 'כמות', 'כמות יחידות', 'יחידות'],
  price: [
    'last price',
    'price',
    'last',
    'close',
    'market price',
    'שער אחרון',
    'שער',
    'מחיר',
    'שער נוכחי',
  ],
  currency: ['currency', 'ccy', 'מטבע', 'מטבע נייר'],
  value: [
    'market value',
    'value',
    'position value',
    'שווי',
    'שווי שוק',
    'שווי נוכחי',
    'שווי אחזקה',
  ],
}

type HoldingColumns = Partial<Record<HoldingField, number>>

function mapHoldingColumns(headers: readonly string[]): HoldingColumns {
  const map: HoldingColumns = {}
  const used = new Set<number>()
  // Exact header matches claim columns before prefix matches.
  for (const exact of [true, false])
    for (const field of HOLDING_FIELDS)
      headers.forEach((raw, col) => {
        if (map[field] !== undefined || used.has(col)) return
        const h = normalizeHeader(raw ?? '')
        if (!h) return
        const hit = ALIASES[field].some((a) => {
          const alias = normalizeHeader(a)
          return exact ? h === alias : h.startsWith(alias + ' ')
        })
        if (hit) {
          map[field] = col
          used.add(col)
        }
      })
  return map
}

export interface ImportedHolding {
  symbol: string
  name: string
  units: string
  /** Per unit, in `currency`'s main unit. */
  price: string | null
  currency: string | null
  assetClass: AssetClass
}

export interface HoldingsFile {
  holdings: ImportedHolding[]
  skipped: { row: number; reason: string }[]
  /** Prices in the file were in hundredths (agorot) and were divided by 100. */
  priceInHundredths: boolean
}

export class HoldingsFormatError extends Error {}

function guessAssetClass(name: string, currency: string | null): AssetClass {
  if (/bond|treasur|אג"?ח|אגח|אגרות|שקלית|מק"?מ/i.test(name)) return 'bonds'
  if (/money market|כספית/i.test(name)) return 'cash'
  return currency === 'ILS' ? 'local_stocks' : 'global_stocks'
}

/** Find the header row (symbol and units at least) in any sheet and read the rows under it. */
export function parseHoldings(sheets: readonly Sheet[], defaultCurrency: string): HoldingsFile {
  for (const sheet of sheets) {
    const headerAt = sheet.rows.findIndex((row, i) => {
      if (i > 30) return false
      const m = mapHoldingColumns(row)
      return m.symbol !== undefined && m.units !== undefined
    })
    if (headerAt < 0) continue
    const cols = mapHoldingColumns(sheet.rows[headerAt]!)
    const cell = (row: string[], f: HoldingField) =>
      cols[f] === undefined ? '' : (row[cols[f]!] ?? '').trim()
    const out: ImportedHolding[] = []
    const skipped: HoldingsFile['skipped'] = []
    let hundredths = 0
    let wholeUnits = 0

    sheet.rows.slice(headerAt + 1).forEach((row, i) => {
      const rowNo = headerAt + i + 2
      if (row.every((c) => !c?.trim())) return
      // Totals rows end the table in many exports.
      if (row.some((c) => /^\s*(total|סה"?כ|סך הכל)\b/i.test(c ?? ''))) return
      const symbol = normalizeSymbol(cell(row, 'symbol'))
      const units = parseDecimal(cell(row, 'units').replace(/[^\d.,-]/g, ''))
      if (!symbol) return skipped.push({ row: rowNo, reason: 'No symbol' })
      if (symbol.length > 20) return skipped.push({ row: rowNo, reason: 'Symbol too long' })
      if (!units || units === '0') return skipped.push({ row: rowNo, reason: 'No quantity' })
      const ccyText = cell(row, 'currency')
      const parsedCcy = ccyText ? parseCurrency(ccyText) : defaultCurrency
      const currency = parsedCcy && isHoldingCurrency(parsedCcy) ? parsedCcy : null
      if (!currency) return skipped.push({ row: rowNo, reason: 'Unknown currency' })
      let price = parseDecimal(cell(row, 'price').replace(/[^\d.,]/g, ''))
      if (price === '0') price = null
      const value = parseDecimal(cell(row, 'value').replace(/[^\d.,]/g, ''))
      // Some exports give local prices in agorot; the market value tells which.
      if (price && value && value !== '0') {
        const asIs = valueMinor(units, price)
        const target = valueMinor(value, '1')
        const near = (a: number) => Math.abs(a - target) <= Math.max(100, target * 0.02)
        if (!near(asIs) && near(Math.round(asIs / 100))) hundredths++
        else wholeUnits++
      } else if (!price && value && value !== '0') {
        // No price column: work it out from the market value.
        price = parseDecimal((Number(value) / Number(units)).toFixed(6))
        if (price === '0') price = null
      }
      const name = cell(row, 'name').replace(/\s+/g, ' ').slice(0, 100) || symbol
      out.push({
        symbol,
        name,
        units,
        price,
        currency,
        assetClass: guessAssetClass(name, currency),
      })
    })

    // Only convert when the file is consistent about it.
    const priceInHundredths = hundredths > 0 && wholeUnits === 0
    if (priceInHundredths)
      for (const h of out) if (h.price) h.price = parseDecimal((Number(h.price) / 100).toFixed(8))
    if (out.length === 0) throw new HoldingsFormatError('No holdings found under the header row')
    return { holdings: out, skipped, priceInHundredths }
  }
  throw new HoldingsFormatError(
    'Couldn’t find a holdings table. It needs columns for the symbol (or security number) and the quantity.',
  )
}
