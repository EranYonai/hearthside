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
