import type { CategorySlug } from '../categories'

/**
 * Built-in hints: words that usually mean a category. They run before the model, are cheap and
 * explainable, and only fire on money out unless the category is about money in.
 * Latin words match whole words. Hebrew words may carry a one-letter prefix (ב, ה, ל…), and
 * words of four letters or more may also run on ("סופר" matches "סופרמרקט").
 */
// prettier-ignore
export const KEYWORDS: Readonly<Record<CategorySlug, readonly string[]>> = {
  groceries: [
    'supermarket', 'super market', 'grocery', 'groceries', 'market', 'minimarket', 'bakery',
    'butcher', 'greengrocer', 'סופר', 'מרקט', 'מכולת', 'מאפיה', 'קצביה', 'ירקות', 'פירות',
  ],
  'eating-out': [
    'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'bistro', 'bar', 'pub', 'grill',
    'falafel', 'shawarma', 'wolt', 'mcdonalds', "mcdonald's", 'starbucks', 'מסעדה', 'מסעדת',
    'קפה', 'פיצה', 'בורגר', 'סושי', 'פלאפל', 'שווארמה', 'מאפה', 'גלידה',
  ],
  home: [
    'ikea', 'furniture', 'hardware', 'home center', 'garden', 'plumber', 'electrician',
    'רהיטים', 'כלי בית', 'אינסטלטור', 'חשמלאי', 'גינון', 'שיפוצים', 'ועד בית',
  ],
  bills: [
    'electric', 'electricity', 'water', 'gas company', 'municipality', 'internet', 'mobile',
    'telecom', 'insurance', 'arnona', 'חשמל', 'מים', 'ארנונה', 'עירייה', 'עיריית', 'גז',
    'ביטוח', 'סלולר', 'אינטרנט', 'תקשורת', 'מועצה',
  ],
  car: [
    'fuel', 'petrol', 'gas station', 'parking', 'garage', 'car wash', 'tolls', 'toll road',
    'דלק', 'תחנת דלק', 'חניה', 'חנייה', 'חניון', 'מוסך', 'שטיפת', 'רישוי', 'כביש 6', 'צמיגים',
  ],
  transport: [
    'taxi', 'uber', 'gett', 'bus', 'train', 'railway', 'metro', 'scooter', 'bike share',
    'מונית', 'רכבת', 'אוטובוס', 'תחבורה', 'רב קו', 'רב-קו',
  ],
  kids: [
    'kindergarten', 'daycare', 'nursery', 'toys', 'school', 'tutor', 'babysitter',
    'גן ילדים', 'גנון', 'מעון', 'צעצועים', 'בית ספר', 'חוג', 'צהרון', 'בייביסיטר',
  ],
  health: [
    'pharmacy', 'clinic', 'dentist', 'doctor', 'hospital', 'optician', 'physio', 'medical',
    'בית מרקחת', 'מרקחת', 'פארם', 'מרפאה', 'רופא', 'שיניים', 'בית חולים', 'אופטיקה', 'קופת חולים',
  ],
  shopping: [
    'amazon', 'aliexpress', 'ebay', 'shein', 'zara', 'h&m', 'fashion', 'shoes', 'electronics',
    'books', 'אופנה', 'נעליים', 'הלבשה', 'ביגוד', 'ספרים', 'אלקטרוניקה', 'מתנות', 'קניון',
  ],
  subscriptions: [
    'netflix', 'spotify', 'disney', 'youtube premium', 'apple.com', 'icloud', 'google storage',
    'google one', 'patreon', 'chatgpt', 'openai', 'claude', 'anthropic', 'adobe', 'microsoft 365',
    'dropbox', 'gym', 'membership', 'subscription', 'מנוי', 'חדר כושר',
  ],
  travel: [
    'airline', 'airlines', 'airways', 'hotel', 'hostel', 'airbnb', 'booking.com', 'expedia',
    'duty free', 'car rental', 'מלון', 'טיסה', 'טיסות', 'השכרת רכב', 'דיוטי פרי',
  ],
  income: ['salary', 'payroll', 'wage', 'משכורת', 'שכר', 'מענק', 'קצבת ילדים', 'ביטוח לאומי'],
  savings: ['savings', 'deposit to savings', 'חיסכון', 'פיקדון', 'פקדון', 'קופת גמל'],
  transfer: ['transfer', 'bit', 'paybox', 'העברה', 'העברת', 'ביט', 'פייבוקס'],
  pension: ['pension', 'provident', 'פנסיה', 'קרן השתלמות', 'גמל'],
  other: [],
}

/** Categories a positive amount can land in from a keyword. */
const MONEY_IN = new Set<CategorySlug>(['income', 'savings', 'transfer', 'pension'])

const HEBREW = /[֐-׿]/
const EDGE = '(?:^|(?<=[^\\p{L}\\p{N}]))'

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Matcher {
  category: CategorySlug
  word: string
  test: (key: string) => boolean
}

function build(table: Readonly<Record<string, readonly string[]>>): Matcher[] {
  const out: Matcher[] = []
  for (const [category, words] of Object.entries(table))
    for (const raw of words) {
      const word = raw.toLowerCase()
      const w = escape(word.trim())
      const re = HEBREW.test(word)
        ? new RegExp(
            `${EDGE}[הובלמשכ]?${w}${word.trim().length >= 4 ? '' : `(?=$|[^\\p{L}])`}`,
            'u',
          )
        : new RegExp(`${EDGE}${w}(?=$|[^\\p{L}\\p{N}])`, 'u')
      out.push({ category: category as CategorySlug, word: word.trim(), test: (k) => re.test(k) })
    }
  // Longer words are more specific: "gas station" before "gas".
  return out.sort((a, b) => b.word.length - a.word.length)
}

const DEFAULT_MATCHERS = build(KEYWORDS)

export interface KeywordHit {
  category: CategorySlug
  word: string
}

/** First keyword found in a normalized description, or undefined. */
export function matchKeyword(
  key: string,
  amountMinor: number,
  extra?: Readonly<Record<string, readonly string[]>>,
): KeywordHit | undefined {
  const matchers = extra ? [...build(extra), ...DEFAULT_MATCHERS] : DEFAULT_MATCHERS
  for (const m of matchers) {
    if (amountMinor > 0 && !MONEY_IN.has(m.category)) continue
    if (amountMinor < 0 && m.category === 'income') continue
    if (m.test(key)) return { category: m.category, word: m.word }
  }
  return undefined
}
