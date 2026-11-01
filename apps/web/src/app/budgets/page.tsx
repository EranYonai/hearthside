import { Card, Label, buttonClasses } from '@hearthside/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { BudgetBar } from '@/components/BudgetBar'
import { BudgetLineView } from '@/components/BudgetLine'
import { PrivateAmount } from '@/components/PrivateAmount'
import { requireDb } from '@/lib/db'
import { budgetableCategories, budgetOverview, monthsBefore } from '@/server/budgets'
import { householdCategorySet } from '@/server/categories'
import { canEdit, listMonths } from '@/server/ledger'
import { requireSession } from '@/server/session'
import { AddBudget, BudgetRow, UseSuggestions } from './client'

export const metadata: Metadata = { title: 'Budgets · Hearthside' }
export const dynamic = 'force-dynamic'

const monthTitle = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const asked = (await searchParams).month
  const thisMonth = new Date().toISOString().slice(0, 7)
  // Open on the newest month with entries, like Home: statements arrive after the month ends.
  const month =
    typeof asked === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked)
      ? asked
      : ((await listMonths(db, member))[0] ?? thisMonth)
  const editable = canEdit(member)
  const [view, categories, allowed] = await Promise.all([
    budgetOverview(db, member, month),
    householdCategorySet(db, member.householdId),
    budgetableCategories(db, member),
  ])
  const { month: progress, suggestions, limits } = view
  const taken = new Set(limits.map((l) => l.category))
  const free = allowed.filter((c) => !taken.has(c.slug))
  const suggested = Object.fromEntries(suggestions.map((s) => [s.category, s.limitMinor]))
  const title = monthTitle.format(new Date(`${month}-01T00:00:00Z`))
  const before = monthsBefore(month, 1)[0]!
  const after = nextMonth(month)

  return (
    <AppShell household={household.name} current="/transactions">
      <h1 className="font-display text-title">Budgets</h1>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/budgets?month=${before}`}
          aria-label="Previous month"
          className={buttonClasses('ghost')}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h2 className="text-heading">{title}</h2>
        {after <= thisMonth ? (
          <Link
            href={`/budgets?month=${after}`}
            aria-label="Next month"
            className={buttonClasses('ghost')}
          >
            <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span className="size-11" />
        )}
      </div>

      {progress.lines.length > 0 ? (
        <>
          <Card aria-label={`Budgets in ${title}`} data-testid="budget-total">
            <Label>{progress.leftMinor < 0 ? 'Over budget' : 'Left to spend'}</Label>
            <PrivateAmount
              minor={Math.abs(progress.leftMinor)}
              whole
              hero
              problem={progress.leftMinor < 0}
              wrapClassName="font-display"
            />
            <BudgetBar
              share={progress.share}
              status={progress.status}
              elapsed={progress.elapsed}
              label="All budgets used"
            />
            <p className="flex flex-wrap items-baseline gap-1 text-caption text-ink-muted">
              <PrivateAmount minor={progress.spentMinor} whole className="text-caption" />
              spent of
              <PrivateAmount minor={progress.limitMinor} whole className="text-caption" />
              {progress.outsideMinor > 0 && (
                <>
                  {' · '}
                  <PrivateAmount minor={progress.outsideMinor} whole className="text-caption" />
                  in categories without a budget
                </>
              )}
            </p>
            {progress.elapsed > 0 && progress.elapsed < 1 && (
              <p className="text-caption text-ink-muted">
                The tick on each bar is where you&rsquo;d be if spending went evenly through the
                month.
              </p>
            )}
          </Card>
          <Card aria-labelledby="lines-title">
            <Label id="lines-title">By category</Label>
            <ul className="grid divide-y divide-line" data-testid="budget-lines">
              {progress.lines.map((line) => (
                <BudgetRow
                  key={line.category}
                  category={line.category}
                  label={categories.label(line.category)}
                  limitMinor={line.limitMinor}
                  editable={editable}
                >
                  <Link
                    href={`/transactions?month=${month}&category=${line.category}`}
                    className="block rounded-md focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <BudgetLineView
                      line={line}
                      categories={categories}
                      elapsed={progress.elapsed}
                    />
                  </Link>
                </BudgetRow>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card>
          <Label>No budgets yet</Label>
          <p>
            Set a monthly limit for the categories you want to keep an eye on. Each one applies to
            every month until you change it.
          </p>
          {!editable && (
            <p className="text-caption text-ink-muted">An owner or adult can set them.</p>
          )}
        </Card>
      )}

      {editable && suggestions.length > 0 && (
        <Card aria-labelledby="suggest-title" data-testid="budget-suggestions">
          <Label id="suggest-title">Suggested from the last 3 months</Label>
          <ul className="grid gap-1">
            {suggestions.map((s) => (
              <li key={s.category} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{categories.label(s.category)}</span>
                <PrivateAmount minor={s.limitMinor} whole />
              </li>
            ))}
          </ul>
          <p className="text-caption text-ink-muted">
            Your average spending, rounded up. You can change any of them after.
          </p>
          <UseSuggestions limits={suggestions} />
        </Card>
      )}

      {editable && free.length > 0 && (
        <Card aria-labelledby="add-title">
          <Label id="add-title">Add a budget</Label>
          <AddBudget
            key={free.map((c) => c.slug).join()}
            options={free.map((c) => ({ slug: c.slug, label: c.label }))}
            suggested={suggested}
          />
        </Card>
      )}
    </AppShell>
  )
}
