import { categoryChanges, sumFlows, yearMonths } from '@hearthside/core'
import { Amount, buttonClasses, Card, CategoryIcon, FlowBars, Label, cx } from '@hearthside/ui'
import type { Category } from '@hearthside/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { householdCategorySet } from '@/server/categories'
import { monthlyFlows, type TransactionFilter } from '@/server/ledger'
import type { MemberRow } from '@hearthside/db'
import type { requireDb } from '@/lib/db'

const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

export function ViewSwitch({
  view,
  href,
}: {
  view: 'month' | 'year'
  href: (v: 'month' | 'year') => string
}) {
  return (
    <nav aria-label="Period" className="flex gap-1 rounded-md bg-surface-2 p-1">
      {(['month', 'year'] as const).map((v) => (
        <Link
          key={v}
          href={href(v)}
          aria-current={view === v ? 'page' : undefined}
          className="flex min-h-11 flex-1 items-center justify-center rounded-sm px-2 text-body-strong text-ink-muted aria-[current=page]:bg-surface-1 aria-[current=page]:text-ink aria-[current=page]:shadow-card"
        >
          {v === 'month' ? 'Month' : 'Year'}
        </Link>
      ))}
    </nav>
  )
}

/** A year at a glance: money in, out and left per month, and each category against last year. */
export async function YearView({
  db,
  member,
  year,
  filter,
  categories,
  query,
}: {
  db: ReturnType<typeof requireDb>
  member: MemberRow
  year: number
  filter: Omit<TransactionFilter, 'month'>
  categories: Awaited<ReturnType<typeof householdCategorySet>>
  query: (change: Record<string, string | undefined>) => string
}) {
  const months = yearMonths(year)
  const before = yearMonths(year - 1)
  const flows = await monthlyFlows(db, member, filter, [...before, ...months])
  const last = flows.slice(0, 12)
  const now = flows.slice(12)
  const sum = sumFlows(now)
  const prev = sumFlows(last)
  const changes = categoryChanges(now, last).filter((c) => c.minor || c.previous)
  const top = Math.max(...changes.flatMap((c) => c.months.map(Math.abs)), 1)
  // Open a category on the newest month of the year that had money moving.
  const latest = [...now].reverse().find((f) => f.spent || f.received)?.month ?? months[0]!
  const bars = now.map((f) => ({
    month: f.month,
    label: shortMonth.format(new Date(`${f.month}-01`)),
    received: f.received,
    spent: f.spent,
    href: query({ view: '', year: '', month: f.month }),
  }))

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={query({ year: String(year - 1) })}
          aria-label="Previous year"
          className={buttonClasses('ghost')}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="font-display text-title">{year}</h1>
        <Link
          href={query({ year: String(year + 1) })}
          aria-label="Next year"
          className={buttonClasses('ghost')}
        >
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <Card aria-label={`Money in and out in ${year}`} className="min-w-0">
        <Label>Left over in {year}</Label>
        <Amount minor={sum.left} signed whole hero problem={sum.left < 0} />
        <dl className="grid grid-cols-2 gap-2" data-testid="year-totals">
          <div className="grid">
            <dt className="text-caption text-ink-muted">Money in</dt>
            <dd>
              <Amount minor={sum.received} whole />
            </dd>
          </div>
          <div className="grid">
            <dt className="text-caption text-ink-muted">Spent</dt>
            <dd>
              <Amount minor={-Math.abs(sum.spent)} whole />
            </dd>
          </div>
          {sum.activeMonths > 0 && (
            <div className="col-span-2 text-caption text-ink-muted">
              About{' '}
              <Amount
                minor={Math.round(sum.spent / sum.activeMonths)}
                whole
                className="text-caption"
              />{' '}
              a month over {sum.activeMonths} {sum.activeMonths === 1 ? 'month' : 'months'}
              {prev.spent !== 0 && (
                <>
                  {' · '}
                  {year - 1}: <Amount minor={prev.spent} whole className="text-caption" /> spent
                </>
              )}
            </div>
          )}
        </dl>
        <FlowBars months={bars} label={`Money in and spent each month of ${year}`} />
      </Card>

      <Card aria-labelledby="cat-title">
        <Label id="cat-title">By category · against {year - 1}</Label>
        {changes.length === 0 ? (
          <p className="text-ink-muted">No spending in {year} yet.</p>
        ) : (
          <ul className="-mx-2 grid" data-testid="category-trends">
            {changes.map((c) => {
              const slug = c.category || null
              const name = categories.label(slug)
              return (
                <li key={c.category || 'none'}>
                  <Link
                    href={query({
                      view: '',
                      year: '',
                      month: latest,
                      category: c.category || 'none',
                    })}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <CategoryIcon category={categories.icon(slug) as Category} />
                    <span className="grid min-w-0 gap-1">
                      <span className="truncate text-body-strong">{name}</span>
                      <span
                        className="flex h-5 items-end gap-px"
                        role="img"
                        aria-label={`${name} by month`}
                      >
                        {c.months.map((m, i) => (
                          <span
                            key={months[i]}
                            className="block w-full max-w-2 rounded-t-[1px] bg-chart-other/60"
                            style={{ height: `${m ? Math.max((Math.abs(m) / top) * 100, 8) : 0}%` }}
                          />
                        ))}
                      </span>
                    </span>
                    <span className="grid justify-items-end">
                      <Amount minor={c.minor} whole />
                      <Change percent={c.percent} />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}

/** Spending up shows as a rise, down as a fall; neither is judged good or bad. */
function Change({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-caption text-ink-muted">new</span>
  return (
    <span className={cx('text-caption tabular-nums text-ink-muted')}>
      {percent > 0 ? '▲' : percent < 0 ? '▼' : ''} {Math.abs(percent)}%
    </span>
  )
}
