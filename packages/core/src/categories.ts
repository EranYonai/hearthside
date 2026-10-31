/** Fixed category set for now; custom categories can come later. Slugs match the UI icons. */
export const CATEGORIES = [
  { slug: 'groceries', label: 'Groceries' },
  { slug: 'eating-out', label: 'Eating out' },
  { slug: 'home', label: 'Home' },
  { slug: 'bills', label: 'Bills' },
  { slug: 'car', label: 'Car' },
  { slug: 'transport', label: 'Transport' },
  { slug: 'kids', label: 'Kids' },
  { slug: 'health', label: 'Health' },
  { slug: 'shopping', label: 'Shopping' },
  { slug: 'subscriptions', label: 'Subscriptions' },
  { slug: 'travel', label: 'Travel' },
  { slug: 'income', label: 'Income' },
  { slug: 'savings', label: 'Savings' },
  { slug: 'transfer', label: 'Transfers' },
  { slug: 'pension', label: 'Pension' },
  { slug: 'other', label: 'Other' },
] as const

export type CategorySlug = (typeof CATEGORIES)[number]['slug']

const LABELS = new Map<string, string>(CATEGORIES.map((c) => [c.slug, c.label]))

export function isCategory(value: unknown): value is CategorySlug {
  return typeof value === 'string' && LABELS.has(value)
}

export function categoryLabel(slug: string | null | undefined): string {
  return (slug && LABELS.get(slug)) || 'Uncategorized'
}

/** Transfers between the household's own accounts are not spending or income. */
export function countsAsSpending(category: string | null | undefined): boolean {
  return category !== 'transfer' && category !== 'savings'
}

/** Icons a household category can use; the first 16 are the built-in categories' own. */
// prettier-ignore
export const CATEGORY_ICON_NAMES = [
  'groceries', 'eating-out', 'home', 'bills', 'car', 'transport', 'kids', 'health', 'shopping',
  'subscriptions', 'travel', 'income', 'savings', 'transfer', 'pension', 'other',
  'pets', 'gifts', 'education', 'sport', 'fun', 'beauty', 'work', 'charity',
] as const

export type CategoryIconName = (typeof CATEGORY_ICON_NAMES)[number]

export function isCategoryIcon(value: unknown): value is CategoryIconName {
  return typeof value === 'string' && (CATEGORY_ICON_NAMES as readonly string[]).includes(value)
}

/** A category a household added. Slugs start with "c-" so they never clash with built-ins. */
export interface CustomCategory {
  slug: string
  label: string
  icon: CategoryIconName
  /** Money in (income-like) or money out. */
  direction: 'out' | 'in'
  /** Words that mean this category, matched like the built-in keywords. */
  keywords: readonly string[]
}

export interface CategoryOption {
  slug: string
  label: string
  icon: CategoryIconName
  custom: boolean
}

/** Built-in plus a household's own categories, with label and icon lookups. */
export interface CategorySet {
  readonly all: readonly CategoryOption[]
  readonly custom: readonly CustomCategory[]
  has(slug: unknown): slug is string
  label(slug: string | null | undefined): string
  icon(slug: string | null | undefined): CategoryIconName
}

export const MAX_CUSTOM_CATEGORIES = 16
export const CUSTOM_PREFIX = 'c-'

export function categorySet(custom: readonly CustomCategory[] = []): CategorySet {
  const all: CategoryOption[] = [
    ...CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, icon: c.slug, custom: false })),
    ...custom.map((c) => ({ slug: c.slug, label: c.label, icon: c.icon, custom: true })),
  ]
  // "Other" stays last.
  all.push(
    all.splice(
      all.findIndex((c) => c.slug === 'other'),
      1,
    )[0]!,
  )
  const bySlug = new Map(all.map((c) => [c.slug, c]))
  return {
    all,
    custom,
    has: (slug): slug is string => typeof slug === 'string' && bySlug.has(slug),
    label: (slug) => (slug && bySlug.get(slug)?.label) || 'Uncategorized',
    icon: (slug) => (slug && bySlug.get(slug)?.icon) || 'other',
  }
}
