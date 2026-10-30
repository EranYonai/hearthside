import {
  Amount,
  Button,
  Card,
  CATEGORY_ICONS,
  CategoryIcon,
  Label,
  Logo,
  SummaryCard,
  SyncStatus,
  TransactionList,
  TransactionRow,
  type Category,
} from '@hearthside/ui'
import { Download, RefreshCw } from 'lucide-react'
import type { Metadata } from 'next'
import { ThemeToggle } from '@/lib/ThemeToggle'

export const metadata: Metadata = { title: 'Design system · Hearthside' }

const COLORS = [
  'surface-0',
  'surface-1',
  'surface-2',
  'line',
  'ink',
  'ink-muted',
  'brand',
  'brand-ink',
  'brand-soft',
  'ember',
  'positive',
  'negative',
  'warning',
  'info',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-other',
]

/** Sample data only, to check components in both themes. */
export default function DesignPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <h1 className="font-display text-title">Design system</h1>
        </div>
        <ThemeToggle />
      </header>

      <section className="grid gap-3" aria-labelledby="colors">
        <h2 id="colors" className="font-display text-heading">
          Color
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {COLORS.map((name) => (
            <li key={name} className="flex items-center gap-2 text-caption">
              <span
                className="size-8 rounded-sm border border-line"
                style={{ background: `var(--hs-${name})` }}
              />
              {name}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Cards">
        <SummaryCard
          label="Left this month"
          minor={682000}
          segments={[
            { name: 'Groceries', minor: 312000, percent: 28 },
            { name: 'Home', minor: 450000, percent: 40 },
            { name: 'Kids', minor: 98000, percent: 9 },
            { name: 'Car', minor: 75000, percent: 7 },
            { name: 'Health', minor: 30000, percent: 3 },
          ]}
        />
        <Card>
          <Label>Sources</Label>
          <div className="flex flex-wrap gap-2">
            <SyncStatus state="ok" detail="06:02" />
            <SyncStatus state="syncing" />
            <SyncStatus state="stale" detail="2 days" />
            <SyncStatus state="blocked" />
            <SyncStatus state="login" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<RefreshCw aria-hidden />}>Sync now</Button>
            <Button variant="secondary" icon={<Download aria-hidden />}>
              Import file
            </Button>
            <Button variant="ghost">See all</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>
      </section>

      <Card>
        <Label>Recent</Label>
        <TransactionList>
          <TransactionRow
            category="groceries"
            merchant="שופרסל דיל"
            meta="Groceries · Card ·4821 · Alex · 28.10"
            minor={-41230}
          />
          <TransactionRow
            category="shopping"
            merchant="ACE"
            meta="Shopping · Card ·1190 · Sam · 27.10"
            minor={-25000}
            installment={{ n: 3, total: 12 }}
          />
          <TransactionRow
            category="travel"
            merchant="Airline"
            meta="Travel · Card ·4821 · Alex · 26.10"
            minor={-17820}
            original={{ minor: -4800, currency: 'USD' }}
          />
          <TransactionRow
            category="income"
            merchant="Salary"
            meta="Income · Account ·0032 · Sam · 25.10"
            minor={1620000}
          />
          <TransactionRow
            category="eating-out"
            merchant="קפה"
            meta="Eating out · Card ·1190 · Sam · 30.10"
            minor={-3800}
            pending
          />
        </TransactionList>
      </Card>

      <Card>
        <Label>Categories</Label>
        <ul className="flex flex-wrap gap-3">
          {(Object.keys(CATEGORY_ICONS) as Category[]).map((c, i) => (
            <li key={c} className="grid justify-items-center gap-1 text-caption text-ink-muted">
              <CategoryIcon category={c} active={i === 0} />
              {c}
            </li>
          ))}
        </ul>
        <div className="flex gap-4">
          <Amount minor={-41230} />
          <Amount minor={1620000} signed whole />
          <Amount minor={-90000} problem />
        </div>
      </Card>
    </main>
  )
}
