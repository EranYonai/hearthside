import type { BudgetLine as Line } from '@hearthside/core'
import { CategoryIcon, type Category } from '@hearthside/ui'
import type { householdCategorySet } from '@/server/categories'
import { BudgetBar } from './BudgetBar'
import { PrivateAmount } from './PrivateAmount'

/** One category against its limit: name, spent of limit, what's left, and a bar. */
export function BudgetLineView({
  line,
  categories,
  elapsed,
}: {
  line: Line
  categories: Awaited<ReturnType<typeof householdCategorySet>>
  elapsed?: number
}) {
  const label = categories.label(line.category)
  const over = line.leftMinor < 0
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <CategoryIcon category={categories.icon(line.category) as Category} />
        <span className="grid min-w-0">
          <span className="truncate text-body-strong">{label}</span>
          <span className="flex flex-wrap items-baseline gap-1 text-caption text-ink-muted">
            <PrivateAmount minor={line.spentMinor} whole className="text-caption" />
            of
            <PrivateAmount minor={line.limitMinor} whole className="text-caption" />
          </span>
        </span>
        <span
          className={`flex items-baseline gap-1 text-caption ${over ? 'text-negative' : 'text-ink-muted'}`}
          data-testid="budget-left"
        >
          <PrivateAmount
            minor={Math.abs(line.leftMinor)}
            whole
            problem={over}
            className="text-body-strong"
          />
          {over ? 'over' : 'left'}
        </span>
      </div>
      <BudgetBar
        share={line.share}
        status={line.status}
        elapsed={elapsed}
        label={`${label} budget used`}
      />
    </div>
  )
}
