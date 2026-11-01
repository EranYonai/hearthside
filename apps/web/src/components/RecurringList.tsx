import type { Recurring } from '@hearthside/core'
import { CategoryIcon, type Category } from '@hearthside/ui'
import type { householdCategorySet } from '@/server/categories'
import { PrivateAmount } from './PrivateAmount'
import { RecurringRow } from './RecurringRow'

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** Repeating payments, each opening its latest month searched for the payee. */
export function RecurringList({
  items,
  categories,
  editable,
  restore = false,
}: {
  items: Recurring[]
  categories: Awaited<ReturnType<typeof householdCategorySet>>
  editable: boolean
  /** The household's "not a fixed cost" list, each with a way back. */
  restore?: boolean
}) {
  return (
    <ul className="-mx-2 grid" data-testid={restore ? 'not-recurring' : 'recurring'}>
      {items.map((r) => (
        <RecurringRow
          key={r.key}
          payeeKey={r.key}
          name={r.description}
          editable={editable}
          restore={restore}
          href={`/transactions?month=${r.lastOn.slice(0, 7)}&q=${encodeURIComponent(r.description.slice(0, 100))}`}
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
        </RecurringRow>
      ))}
    </ul>
  )
}
