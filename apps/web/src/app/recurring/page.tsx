import { Card, Label } from '@hearthside/ui'
import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'
import { PrivateAmount } from '@/components/PrivateAmount'
import { RecurringList } from '@/components/RecurringList'
import { requireDb } from '@/lib/db'
import { householdCategorySet } from '@/server/categories'
import { listRecurring } from '@/server/recurring'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Fixed costs · Hearthside' }
export const dynamic = 'force-dynamic'

export default async function RecurringPage() {
  const { member, household } = await requireSession()
  const db = requireDb()
  const [items, categories] = await Promise.all([
    listRecurring(db, member),
    householdCategorySet(db, member.householdId),
  ])
  const monthly = items.reduce((n, r) => n + r.monthlyMinor, 0)
  const changed = items.filter((r) => r.changedPercent !== null)

  return (
    <AppShell household={household.name} current="/transactions">
      <h1 className="font-display text-title">Fixed costs</h1>
      <Card aria-label="Fixed costs a month">
        <Label>About this much goes out every month</Label>
        <PrivateAmount minor={monthly} whole hero wrapClassName="font-display" />
        <p className="text-caption text-ink-muted">
          {items.length === 0
            ? 'Nothing repeats yet. Payments show up here after three months in a row, or two years in a row.'
            : `${items.length} repeating ${items.length === 1 ? 'payment' : 'payments'}${
                changed.length ? `, ${changed.length} with a new price` : ''
              }. Yearly ones are spread over twelve months.`}
        </p>
      </Card>
      {items.length > 0 && (
        <Card aria-labelledby="recurring-title">
          <Label id="recurring-title">Repeating payments</Label>
          <RecurringList items={items} categories={categories} />
        </Card>
      )}
    </AppShell>
  )
}
