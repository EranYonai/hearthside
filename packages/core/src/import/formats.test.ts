import { describe, expect, it } from 'vitest'
import { makePdf, makeXlsx, type PdfText } from './fixtures'
import { wordsToRows } from './pdf'
import { parseStatement } from './statement'
import { ImportFormatError, readStatementFile } from './table'

// Synthetic files shaped like common exports. Names, merchants and amounts are made up.

describe('card export with three sheets and a preamble', () => {
  const header = [
    'תאריך עסקה',
    'שם בית העסק',
    'קטגוריה',
    '4 ספרות אחרונות של כרטיס האשראי',
    'סוג עסקה',
    'סכום חיוב',
    'מטבע חיוב',
    'סכום עסקה מקורי',
    'מטבע עסקה מקורי',
    'תאריך חיוב',
    'הערות',
    'תיוגים',
    'מועדון הנחות',
    'מפתח דיסקונט',
    'אופן ביצוע ההעסקה',
    'שער המרה ממטבע מקור/התחשבנות לש"ח',
  ]
  const sheet = (rows: (string | number)[][]) => [
    ['Card statement'],
    ['01-10-2026 - 31-10-2026'],
    [''],
    header,
    ...rows,
    [''],
    ['סך הכל', '', '', '', '', '123.40'],
  ]
  const bytes = makeXlsx({
    Local: sheet([
      [
        '05-10-2026',
        'Corner Bakery',
        'מזון',
        '1234',
        'רגילה',
        42.5,
        '₪',
        42.5,
        '₪',
        '02-11-2026',
        '',
        '',
        '',
        '',
        'טלפוני',
        '',
      ],
      [
        '07-10-2026',
        'Home Store',
        'ריהוט',
        '1234',
        'תשלומים',
        100,
        '₪',
        600,
        '₪',
        '02-11-2026',
        'תשלום 1 מתוך 6',
        '',
        '',
        '',
        '',
        '',
      ],
      [
        '09-10-2026',
        'Corner Bakery',
        'מזון',
        '1234',
        'זיכוי',
        -19.1,
        '₪',
        -19.1,
        '₪',
        '02-11-2026',
        '',
        '',
        '',
        '',
        '',
        '',
      ],
    ]),
    Abroad: sheet([
      [
        '11-10-2026',
        'Example Air',
        'תיירות',
        '1234',
        'רגילה',
        371.25,
        '₪',
        99,
        'USD',
        '02-11-2026',
        '',
        '',
        '',
        '',
        '',
        '3.75',
      ],
    ]),
    Pending: sheet([]),
  })

  it('reads every sheet', async () => {
    const result = parseStatement(await readStatementFile(bytes, 'export.xlsx'), {
      spendingIsPositive: true,
    })
    expect(result.tables.map((t) => [t.sheet, t.headerRow])).toEqual([
      ['Local', 4],
      ['Abroad', 4],
      ['Pending', 4],
    ])
    expect(result.tables[0]!.columns).toMatchObject({
      date: 0,
      description: 1,
      amount: 5,
      originalAmount: 7,
      originalCurrency: 8,
      postedDate: 9,
      notes: 10,
    })
    expect(
      result.transactions.map((t) => [t.occurredOn, t.description, t.amountMinor, t.postedOn]),
    ).toEqual([
      ['2026-10-05', 'Corner Bakery', -4250, '2026-11-02'],
      ['2026-10-07', 'Home Store', -10000, '2026-11-02'],
      ['2026-10-09', 'Corner Bakery', 1910, '2026-11-02'],
      ['2026-10-11', 'Example Air', -37125, '2026-11-02'],
    ])
    expect(result.transactions[1]!.installment).toEqual({ n: 1, total: 6 })
    expect(result.transactions[3]!.original).toEqual({ minor: 9900, currency: 'USD' })
    expect(result.skipped).toEqual([])
  })
})

describe('card export with a title, merged rows and multi-line headers', () => {
  it('finds the header and reads date cells', async () => {
    const bytes = makeXlsx({
      Sheet1: [
        ['פירוט חיובים לכרטיס 9999'],
        ['', '', '', '', '', '', ''],
        ['סך חיובים: 250.00'],
        ['תאריך\nעסקה', 'שם בית\nעסק', 'סכום\nעסקה', 'סכום\nחיוב', 'סוג\nעסקה', 'ענף', 'הערות'],
        [46300, 'Fresh Market', 250, 250, 'רגילה', 'מזון', ''],
        [46301, 'Bus Pass', 300, 100, 'תשלומים', 'תחבורה', 'תשלום 1 מתוך 3'],
        ['העסקאות מוצגות לפי מועד החיוב. ייתכנו הבדלים בין הסכומים המוצגים לבין הסכומים בפועל'],
      ],
    })
    const result = parseStatement(await readStatementFile(bytes), { spendingIsPositive: true })
    expect(result.tables[0]!.headerRow).toBe(4)
    expect(result.transactions.map((t) => [t.occurredOn, t.description, t.amountMinor])).toEqual([
      ['2026-10-05', 'Fresh Market', -25000],
      ['2026-10-06', 'Bus Pass', -10000],
    ])
    expect(result.transactions[1]!.installment).toEqual({ n: 1, total: 3 })
    expect(result.skipped).toEqual([])
  })
})

/** Lay a row out the way a statement PDF does: fixed x per column. */
function pdfRow(y: number, cells: [string, string, string, string, string]): PdfText[] {
  const xs = [40, 110, 330, 400, 480]
  return cells.flatMap((text, i) => (text ? [{ x: xs[i]!, y, text }] : []))
}

describe('bank statement PDF', () => {
  const page1: PdfText[] = [
    { x: 40, y: 800, text: 'Account 99-999-999999' },
    { x: 40, y: 785, text: 'For the period 01/10/2026 - 31/10/2026' },
    ...pdfRow(750, ['Date', 'Transaction', 'Debit', 'Credit', 'Balance (NIS)']),
    ...pdfRow(735, ['01/10/2026', 'Salary Example Ltd', '', '16,200.00', '20,000.00']),
    { x: 570, y: 729, text: '1' },
    ...pdfRow(720, ['03/10/2026', 'Rent', '5,500.00', '', '14,500.00']),
    ...pdfRow(705, ['04/10/2026', 'Card payment', '123.45', '', '14,376.55']),
    { x: 110, y: 695, text: 'continued text' },
    { x: 280, y: 30, text: 'Page 1 of 2' },
  ]
  const page2: PdfText[] = [
    ...pdfRow(800, ['Date', 'Transaction', 'Debit', 'Credit', 'Balance (NIS)']),
    ...pdfRow(785, ['05/10/2026', 'Interest', '', '1.20', '14,377.75']),
    { x: 280, y: 30, text: 'Page 2 of 2' },
  ]

  it('splits columns by position and continues wrapped text', async () => {
    const sheets = await readStatementFile(makePdf([page1, page2]), 'ops.pdf')
    expect(sheets[0]!.rows).toEqual([
      ['Date', 'Transaction', 'Debit', 'Credit', 'Balance (NIS)'],
      ['01/10/2026', 'Salary Example Ltd', '', '16,200.00', '20,000.00'],
      ['03/10/2026', 'Rent', '5,500.00', '', '14,500.00'],
      ['04/10/2026', 'Card payment continued text', '123.45', '', '14,376.55'],
      ['05/10/2026', 'Interest', '', '1.20', '14,377.75'],
    ])
    const result = parseStatement(sheets, { spendingIsPositive: true })
    expect(result.transactions.map((t) => [t.occurredOn, t.amountMinor])).toEqual([
      ['2026-10-01', 1620000],
      ['2026-10-03', -550000],
      ['2026-10-04', -12345],
      ['2026-10-05', 120],
    ])
  })

  it('ignores lines before the first header', () => {
    expect(wordsToRows([[{ text: 'Hello', x: 1, right: 20, y: 5 }]])).toEqual([])
  })

  it('reports unreadable PDFs', async () => {
    await expect(
      readStatementFile(new TextEncoder().encode('%PDF-1.4 garbage')),
    ).rejects.toBeInstanceOf(ImportFormatError)
  })
})
