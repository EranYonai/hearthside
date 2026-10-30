import { describe, expect, it } from 'vitest'
import { mapColumns, normalizeHeader } from './columns'
import { parseCsv, guessDelimiter } from './csv'
import { makeXlsx } from './fixtures'
import { decodeEntities, parseHtmlTables } from './html'
import { duplicateKeys, parseStatement, StatementError } from './statement'
import { ImportFormatError, readTable } from './table'
import {
  normalizeDescription,
  parseAmount,
  parseCurrency,
  parseDate,
  parseInstallment,
} from './values'
import { columnIndex } from './xlsx'

const enc = (s: string) => new TextEncoder().encode(s)

describe('values', () => {
  it.each([
    ['28/10/2026', '2026-10-28'],
    ['1.2.26', '2026-02-01'],
    ['05-11-2026 10:30', '2026-11-05'],
    ['2026-10-28', '2026-10-28'],
    ['2026-10-28T00:00:00', '2026-10-28'],
    ['46323', '2026-10-28'],
    ['31/02/2026', undefined],
    ['סה"כ', undefined],
    ['', undefined],
    ['12345', undefined],
    ['01/01/1970', undefined],
  ])('parseDate(%j) = %j', (input, out) => expect(parseDate(input)).toBe(out))

  it.each([
    ['412.30', 41230],
    ['1,234.50', 123450],
    ['₪ 89', 8900],
    ['-12.5', -1250],
    ['12.30-', -1230],
    ['(7.00)', -700],
    ['‎-1,000', -100000],
    ['+3', 300],
    ['−4.20', -420],
    ['250 ש"ח', 25000],
    ['', undefined],
    ['abc', undefined],
    ['1.2.3', undefined],
  ])('parseAmount(%j) = %j', (input, out) => expect(parseAmount(input)).toBe(out))

  it('reads installments', () => {
    expect(parseInstallment('תשלום 2 מתוך 6')).toEqual({ n: 2, total: 6 })
    expect(parseInstallment('3/12')).toEqual({ n: 3, total: 12 })
    expect(parseInstallment('payment 1 of 3')).toEqual({ n: 1, total: 3 })
    expect(parseInstallment('7 מתוך 6')).toBeUndefined()
    expect(parseInstallment('רגילה')).toBeUndefined()
  })

  it('reads currencies', () => {
    expect(parseCurrency('$')).toBe('USD')
    expect(parseCurrency('₪')).toBe('ILS')
    expect(parseCurrency('eur')).toBe('EUR')
    expect(parseCurrency('יורו')).toBe('EUR')
    expect(parseCurrency('')).toBeUndefined()
    expect(parseCurrency('money')).toBeUndefined()
  })

  it('normalizes descriptions', () => {
    expect(normalizeDescription('  Super‏  Market ')).toBe('super market')
  })
})

describe('csv and html', () => {
  it('parses quoted fields, CRLF and guesses the delimiter', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ])
    expect(guessDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(guessDelimiter('a\tb\n1\t2')).toBe('\t')
    expect(parseCsv('x;y', ';')).toEqual([['x', 'y']])
  })

  it('reads HTML tables', () => {
    const html = `<html><body><table><tr><th>תאריך</th><th>תיאור</th></tr>
      <tr><td>01/10/2026</td><td><b>Coffee</b>&nbsp;&amp; cake</td></tr></table></body></html>`
    expect(parseHtmlTables(html)).toEqual([
      ['תאריך', 'תיאור'],
      ['01/10/2026', 'Coffee & cake'],
    ])
    expect(decodeEntities('&#x41;&#66;&unknown;')).toBe('AB&unknown;')
  })
})

describe('readTable', () => {
  it('reads xlsx workbooks, every sheet', () => {
    const bytes = makeXlsx({
      One: [
        ['a', 1],
        ['', 'b'],
      ],
      Two: [['x']],
    })
    const sheets = readTable(bytes, 'f.xlsx')
    expect(sheets.map((s) => s.name)).toEqual(['One', 'Two'])
    expect(sheets[0]!.rows).toEqual([
      ['a', '1'],
      ['', 'b'],
    ])
    expect(columnIndex('AB12')).toBe(27)
  })

  it('reads CSV in UTF-8 with a BOM and in Windows Hebrew', () => {
    expect(readTable(enc('﻿a,b\n1,2'))[0]!.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    // "שלום" in windows-1255
    const hebrew = new Uint8Array([0xf9, 0xec, 0xe5, 0xed, 0x2c, 0x31])
    expect(readTable(hebrew)[0]!.rows).toEqual([['שלום', '1']])
  })

  it('reads HTML saved as .xls', () => {
    const rows = readTable(enc('<table><tr><td>1</td></tr></table>'), 'x.xls')[0]!.rows
    expect(rows).toEqual([['1']])
  })

  it('explains files it cannot read', () => {
    expect(() => readTable(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toThrow(
      ImportFormatError,
    )
    expect(() => readTable(new Uint8Array([0x50, 0x4b, 1, 2, 3]))).toThrow(ImportFormatError)
    expect(() => readTable(new Uint8Array([0x89, 0x50, 0, 0, 0]))).toThrow(ImportFormatError)
  })
})

describe('columns', () => {
  it('maps common Hebrew and English headers', () => {
    expect(
      mapColumns([
        'תאריך עסקה',
        'שם בית העסק',
        'סכום עסקה',
        'מטבע עסקה',
        'סכום חיוב',
        'תאריך חיוב',
        'פירוט נוסף',
      ]),
    ).toEqual({
      date: 0,
      description: 1,
      originalAmount: 2,
      originalCurrency: 3,
      amount: 4,
      postedDate: 5,
      notes: 6,
    })
    expect(mapColumns(['Date', 'Description', 'Debit', 'Credit', 'Balance'])).toEqual({
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
    })
    expect(normalizeHeader(' סכום חיוב (₪) ')).toBe('סכום חיוב')
    expect(mapColumns(['סכום חיוב ₪', 'תאריך'])).toEqual({ amount: 0, date: 1 })
  })
})

const card = [
  ['Statement for Alex', '', '', '', ''],
  ['', '', '', '', ''],
  ['תאריך עסקה', 'שם בית העסק', 'סכום חיוב', 'פירוט נוסף', 'אסמכתא'],
  ['28/10/2026', 'Super Market', '412.30', '', ''],
  ['27/10/2026', 'Coffee', '18', '', ''],
  ['27/10/2026', 'Coffee', '18', '', ''],
  ['12/09/2026', 'Furniture', '500', 'תשלום 2 מתוך 6', ''],
  ['26/10/2026', 'Refund', '-50', '', ''],
  ['', 'סה"כ', '898.30', '', ''],
  ['bad', 'Broken row', '5', 'x', ''],
  ['', '', '', '', ''],
  ['עסקאות בחו"ל', '', '', '', ''],
  ['תאריך רכישה', 'שם בית עסק', 'סכום עסקה', 'מטבע', 'סכום חיוב'],
  ['20/10/2026', 'Hotel', '100', '$', '372.10'],
]

describe('parseStatement', () => {
  it('reads a card statement with two tables, skipping titles and totals', () => {
    const result = parseStatement([{ name: 'Oct', rows: card }], { spendingIsPositive: true })
    expect(result.tables.map((t) => t.headerRow)).toEqual([3, 13])
    expect(result.transactions.map((t) => [t.occurredOn, t.description, t.amountMinor])).toEqual([
      ['2026-10-28', 'Super Market', -41230],
      ['2026-10-27', 'Coffee', -1800],
      ['2026-10-27', 'Coffee', -1800],
      ['2026-09-12', 'Furniture', -50000],
      ['2026-10-26', 'Refund', 5000],
      ['2026-10-20', 'Hotel', -37210],
    ])
    expect(result.transactions[3]!.installment).toEqual({ n: 2, total: 6 })
    expect(result.transactions[3]!.notes).toBe('תשלום 2 מתוך 6')
    expect(result.transactions[5]!.original).toEqual({ minor: 10000, currency: 'USD' })
    expect(result.skipped).toEqual([{ sheet: 'Oct', row: 10, reason: 'no date' }])
  })

  it('reads a bank statement with debit and credit columns', () => {
    const rows = [
      ['תאריך', 'תאריך ערך', 'הפעולה', 'חובה', 'זכות', 'יתרה'],
      ['01/10/2026', '02/10/2026', 'Salary', '', '16,200.00', '20,000'],
      ['03/10/2026', '03/10/2026', 'Rent', '5,500.00', '', '14,500'],
      ['04/10/2026', '04/10/2026', 'Nothing', '', '', '14,500'],
    ]
    const result = parseStatement([{ name: 'S', rows }], { spendingIsPositive: true })
    expect(result.transactions.map((t) => [t.description, t.amountMinor, t.postedOn])).toEqual([
      ['Salary', 1620000, '2026-10-02'],
      ['Rent', -550000, undefined],
    ])
    expect(result.skipped).toEqual([{ sheet: 'S', row: 4, reason: 'no amount' }])
  })

  it('keeps signs as they are when spending is already negative', () => {
    const rows = [
      ['date', 'description', 'amount'],
      ['2026-10-01', 'Shop', '-10'],
      ['2026-10-02', '', '-10'],
    ]
    const result = parseStatement([{ name: 'S', rows }], { spendingIsPositive: false })
    expect(result.transactions[0]!.amountMinor).toBe(-1000)
    expect(result.skipped[0]!.reason).toBe('no description')
  })

  it('uses a column override', () => {
    const rows = [
      ['when', 'what', 'how much'],
      ['01/10/2026', 'Shop', '10'],
    ]
    expect(() => parseStatement([{ name: 'S', rows }], { spendingIsPositive: true })).toThrow(
      StatementError,
    )
    const result = parseStatement(
      [{ name: 'S', rows: [['תאריך', 'תיאור', 'סכום'], ...rows.slice(1)] }],
      { spendingIsPositive: true },
      { date: 0, description: 1, amount: 2 },
    )
    expect(result.transactions).toHaveLength(1)
  })

  it('reads a real workbook end to end', () => {
    const bytes = makeXlsx({
      Oct: card.map((r) => r.map((c) => (/^\d+(\.\d+)?$/.test(c) ? Number(c) : c))),
    })
    const result = parseStatement(readTable(bytes), { spendingIsPositive: true })
    expect(result.transactions).toHaveLength(6)
  })
})

describe('duplicateKeys', () => {
  it('is stable across files and tells identical rows apart', () => {
    const { transactions } = parseStatement([{ name: 'A', rows: card }], {
      spendingIsPositive: true,
    })
    const keys = duplicateKeys(transactions)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[1]).not.toBe(keys[2])
    // The same rows in another export (different sheet, order of other rows) match.
    const again = parseStatement([{ name: 'B', rows: [card[2]!, card[5]!, card[4]!, card[3]!] }], {
      spendingIsPositive: true,
    })
    expect(duplicateKeys(again.transactions)).toEqual([keys[1], keys[2], keys[0]])
  })

  it('prefers the issuer reference', () => {
    const rows = [
      ['תאריך', 'תיאור', 'סכום', 'אסמכתא'],
      ['01/10/2026', 'Shop', '10', '991'],
      ['01/10/2026', 'Shop (pending)', '10', '991'],
    ]
    const { transactions } = parseStatement([{ name: 'S', rows }], { spendingIsPositive: true })
    const [a, b] = duplicateKeys(transactions)
    expect(a).toBe('ref|991||0')
    expect(b).toBe('ref|991||1')
  })
})
