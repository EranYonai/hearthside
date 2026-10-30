export const FIELDS = [
  'date',
  'postedDate',
  'description',
  'amount',
  'originalAmount',
  'originalCurrency',
  'debit',
  'credit',
  'installments',
  'notes',
  'reference',
  'last4',
] as const
export type Field = (typeof FIELDS)[number]

/** Column index for each field we found. */
export type ColumnMap = Partial<Record<Field, number>>

/** Header names seen in common exports, best match first. Compared after normalizeHeader. */
const ALIASES: Record<Field, string[]> = {
  date: [
    'תאריך עסקה',
    'תאריך העסקה',
    'תאריך רכישה',
    'תאריך הרכישה',
    'תאריך',
    'transaction date',
    'purchase date',
    'date',
  ],
  postedDate: ['תאריך חיוב', 'מועד חיוב', 'תאריך ערך', 'charge date', 'posting date', 'value date'],
  description: [
    'שם בית העסק',
    'שם בית עסק',
    'בית העסק',
    'בית עסק',
    'תיאור התנועה',
    'תיאור',
    'הפעולה',
    'פרטים',
    'description',
    'transaction',
    'details',
    'merchant',
    'payee',
  ],
  amount: ['סכום חיוב', 'סכום החיוב', 'סכום לחיוב', 'סכום בשח', 'סכום', 'charged amount', 'amount'],
  originalAmount: [
    'סכום עסקה',
    'סכום העסקה',
    'סכום עסקה מקורי',
    'סכום מקורי',
    'original amount',
    'transaction amount',
  ],
  originalCurrency: ['מטבע עסקה', 'מטבע מקור', 'מטבע העסקה', 'מטבע', 'currency'],
  debit: ['חובה', 'בחובה', 'debit', 'withdrawal'],
  credit: ['זכות', 'בזכות', 'credit', 'deposit'],
  installments: ['תשלומים', 'מספר תשלום', 'תשלום', 'installments', 'installment'],
  notes: ['פירוט נוסף', 'פרטים נוספים', 'הערות', 'הערה', 'notes', 'memo'],
  reference: ['אסמכתא', 'מספר אסמכתא', 'אסמכתה', 'reference', 'ref'],
  last4: [
    '4 ספרות אחרונות של כרטיס האשראי',
    '4 ספרות אחרונות',
    'ספרות אחרונות',
    'מספר כרטיס',
    'כרטיס',
    'card last 4',
    'last 4 digits',
    'card number',
    'card',
  ],
}

export function normalizeHeader(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[‎‏"'״׳`]/g, '')
    .replace(/\(.*?\)|[₪$€:*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** How well a header text matches a field: 2 exact, 1 starts with an alias, 0 none. Earlier aliases win ties. */
function score(header: string, field: Field): number {
  const aliases = ALIASES[field]
  const exact = aliases.indexOf(header)
  if (exact >= 0) return 2000 - exact
  const prefix = aliases.findIndex((a) => header.startsWith(a + ' '))
  if (prefix >= 0) return 1000 - prefix
  return 0
}

/** Match header cells to fields. Each column is used once; stronger matches claim first. */
export function mapColumns(headers: readonly string[]): ColumnMap {
  const normalized = headers.map((h) => normalizeHeader(h ?? ''))
  const candidates: { field: Field; col: number; score: number }[] = []
  normalized.forEach((h, col) => {
    if (!h) return
    for (const field of FIELDS) {
      const s = score(h, field)
      if (s) candidates.push({ field, col, score: s })
    }
  })
  candidates.sort((a, b) => b.score - a.score)
  const map: ColumnMap = {}
  const used = new Set<number>()
  for (const c of candidates) {
    if (map[c.field] !== undefined || used.has(c.col)) continue
    map[c.field] = c.col
    used.add(c.col)
  }
  return map
}

/** A header row needs a date, a description and some amount. */
export function isUsable(map: ColumnMap): boolean {
  return (
    map.date !== undefined &&
    map.description !== undefined &&
    (map.amount !== undefined ||
      map.originalAmount !== undefined ||
      map.debit !== undefined ||
      map.credit !== undefined)
  )
}

export function fieldCount(map: ColumnMap): number {
  return Object.keys(map).length
}
