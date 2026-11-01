import type { Recurring } from '@hearthside/core'
import { CategoryIcon, type Category } from '@hearthside/ui'
import Link from 'next/link'
import type { householdCategorySet } from '@/server/categories'
import { PrivateAmount } from './PrivateAmount'

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** Repeating payments, each opening its latest month searched for the payee. */
export function RecurringList({
  items,
  categories,
}: {
  items: Recurring[]
  categories: Awaited<ReturnType<typeof householdCategorySet>>
}) {
  return (
    <ul className="-mx-2 grid" data-testid="recurring">
      {items.map((r) => (
        <li key={r.key}>
          <Link
            href={`/transactions?month=${r.lastOn.slice(0, 7)}&q=${encodeURIComponent(r.description.slice(0, 100))}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <CategoryIcon category={categories.icon(r.category) as Category} />
            <span className="grid min-w-0">
              <span className="truncate text-body-strong" dir="auto">
                {r.description}
              </span>
              <span className="text-caption text-ink-muted">
                {r.cadence === 'monthly' ? 'Monthly' : 'Yearly'} · next about{' '}
                {dayFormat.format(new Date(`${r.nextOn}T00:00:00Z`))}
              </span>
            </span>
            <span className="grid justify-items-end">
              <PrivateAmount minor={r.lastMinor} whole />
              {r.changedPercent !== null && (
                <span className="text-caption text-warning" data-testid="price-change">
                  {r.changedPercent > 0 ? '▲' : '▼'} {Math.abs(r.changedPercent)}% vs usual
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
