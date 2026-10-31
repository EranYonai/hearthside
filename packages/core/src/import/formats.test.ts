import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { makePdf, makeXlsx, type PdfText } from './fixtures'
import { wordsToRows } from './pdf'
import { detectSource, suggestAccountName, providerLabel } from './detect'
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
    expect(result.transactions.every((t) => t.last4 === '1234')).toBe(true)
    expect(
      detectSource(await readStatementFile(bytes), result, 'transaction-details_export_1.xlsx'),
    ).toEqual({
      provider: 'max',
      kind: 'card',
      network: null,
      last4: '1234',
    })
  })

  it('splits a file that lists several cards', () => {
    const rows = [
      header,
      ['05-10-2026', 'Shop A', '', '1111', '', 10, '₪', 10, '₪', '', '', '', '', '', '', ''],
      ['06-10-2026', 'Shop B', '', '2222', '', 20, '₪', 20, '₪', '', '', '', '', '', '', ''],
    ].map((r) => r.map(String))
    const result = parseStatement([{ name: 'S', rows }], { spendingIsPositive: true })
    expect(result.transactions.map((t) => t.last4)).toEqual(['1111', '2222'])
    expect(detectSource([{ name: 'S', rows }], result, 'x.xlsx')).toMatchObject({
      provider: 'max',
      last4: null,
    })
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
    expect(
      detectSource(
        await readStatementFile(bytes),
        result,
        'פירוט חיובים לכרטיס מאסטרקארד 4321 - 10.26.xlsx',
      ),
    ).toEqual({ provider: 'cal', kind: 'card', network: 'mastercard', last4: '4321' })
  })
})

describe('workbooks written with prefixed tags', () => {
  /** Rewrite a fixture the way some exporters do: x: prefixes, _x000D_ escapes, other file-name case. */
  function prefixed(bytes: Uint8Array): Uint8Array {
    const out: Record<string, Uint8Array> = {}
    for (const [name, data] of Object.entries(unzipSync(bytes))) {
      let xml = strFromU8(data)
      if (name.startsWith('xl/') && !name.includes('_rels'))
        xml = xml
          .replace(/<(\/?)(?!\?)([a-zA-Z]+)/g, '<$1x:$2')
          .replace(/xmlns=/, 'xmlns:x=')
          .replace(/\n/g, '_x000D_\n')
      out[name === 'xl/sharedStrings.xml' ? 'xl/SharedStrings.xml' : name] = strToU8(xml)
    }
    return zipSync(out)
  }

  it('reads them like any other workbook', async () => {
    const bytes = prefixed(
      makeXlsx({
        Sheet1: [
          ['פירוט חיובים לכרטיס 9999'],
          ['תאריך\nעסקה', 'שם בית\nעסק', 'סכום\nעסקה', 'סכום\nחיוב'],
          [46300, 'Fresh Market', 250, 250],
        ],
      }),
    )
    expect(strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']!)).toContain('<x:row')
    const sheets = await readStatementFile(bytes)
    expect(sheets[0]!.rows[1]![0]).toBe('תאריך\r\nעסקה')
    const result = parseStatement(sheets, { spendingIsPositive: true })
    expect(result.transactions.map((t) => [t.occurredOn, t.description, t.amountMinor])).toEqual([
      ['2026-10-05', 'Fresh Market', -25000],
    ])
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
      ['Account 99-999-999999'],
      ['For the period 01/10/2026 - 31/10/2026'],
      ['Date', 'Transaction', 'Debit', 'Credit', 'Balance (NIS)'],
      ['01/10/2026', 'Salary Example Ltd', '', '16,200.00', '20,000.00'],
      ['03/10/2026', 'Rent', '5,500.00', '', '14,500.00'],
      ['04/10/2026', 'Card payment continued text', '123.45', '', '14,376.55'],
      ['05/10/2026', 'Interest', '', '1.20', '14,377.75'],
    ])
    const result = parseStatement(sheets, { spendingIsPositive: true })
    expect(detectSource(sheets, result, 'current_account_operations_2026.pdf')).toEqual({
      provider: 'hapoalim',
      kind: 'bank',
      network: null,
      last4: '9999',
    })
    expect(result.transactions.map((t) => [t.occurredOn, t.amountMinor])).toEqual([
      ['2026-10-01', 1620000],
      ['2026-10-03', -550000],
      ['2026-10-04', -12345],
      ['2026-10-05', 120],
    ])
  })

  it('keeps lines before the first header as plain text rows', () => {
    expect(wordsToRows([[{ text: 'Hello', x: 1, right: 20, y: 5 }]])).toEqual([['Hello']])
  })

  it('reports unreadable PDFs', async () => {
    await expect(
      readStatementFile(new TextEncoder().encode('%PDF-1.4 garbage')),
    ).rejects.toBeInstanceOf(ImportFormatError)
  })
})

describe('detectSource fallbacks', () => {
  it('guesses bank or card from the columns when the provider is unknown', () => {
    const bank = [
      {
        name: 'S',
        rows: [
          ['date', 'description', 'debit', 'credit'],
          ['01/10/2026', 'X', '5', ''],
        ],
      },
    ]
    const card = [
      {
        name: 'S',
        rows: [
          ['Statement for card ending 7777'],
          ['date', 'description', 'amount'],
          ['01/10/2026', 'X', '5'],
        ],
      },
    ]
    const opts = { spendingIsPositive: true }
    expect(detectSource(bank, parseStatement(bank, opts), 'a.csv')).toEqual({
      provider: null,
      kind: 'bank',
      network: null,
      last4: null,
    })
    expect(detectSource(card, parseStatement(card, opts), 'visa.csv')).toEqual({
      provider: null,
      kind: 'card',
      network: 'visa',
      last4: '7777',
    })
    expect(detectSource(card, undefined, 'ישראכרט.xlsx').provider).toBe('isracard')
    expect(detectSource(card, undefined, 'American Express.xlsx')).toMatchObject({
      provider: 'amex',
      network: 'amex',
    })
  })

  it('names accounts', () => {
    expect(suggestAccountName({ provider: 'max', kind: 'card', last4: '1234' })).toBe('Max ·1234')
    expect(suggestAccountName({ provider: 'hapoalim', kind: 'bank', last4: '9999' })).toBe(
      'Hapoalim account ·9999',
    )
    expect(suggestAccountName({ provider: null, kind: 'bank', last4: null })).toBe('Bank account')
    expect(suggestAccountName({ provider: null, kind: 'card', last4: '1' })).toBe('Card ·1')
    expect(providerLabel('cal')).toBe('Cal')
    expect(providerLabel('nope')).toBeNull()
    expect(providerLabel(null)).toBeNull()
  })
})

describe('isCardPayment', () => {
  it('spots card bills in bank descriptions', async () => {
    const { isCardPayment } = await import('./detect')
    expect(isCardPayment('ישראכרט חיוב')).toBe(true)
    expect(isCardPayment('MAX IT FINANCE')).toBe(true)
    expect(isCardPayment('Fresh Market')).toBe(false)
    expect(isCardPayment('Salary')).toBe(false)
  })
})
