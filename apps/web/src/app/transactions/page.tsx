import { ALERT_LABELS } from '@hearthside/core'
import { accountLook, budgetMonth, cardBillNote, emptyFlow } from '@hearthside/core'
import {
  Amount,
  buttonClasses,
  Card,
  Label,
  SpendingBreakdown,
  TransactionList,
} from '@hearthside/ui'
import { ChevronLeft, ChevronRight, FileUp, Search } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { BudgetLineView } from '@/components/BudgetLine'
import { requireDb } from '@/lib/db'
import { isMonth, monthName, shiftMonth } from '@/lib/month'
import {
  canEdit,
  holderOf,
  listAccounts,
  listMonths,
  listTransactions,
  monthlySpending,
  totals,
  type TransactionFilter,
} from '@/server/ledger'
import { listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { householdCategorySet } from '@/server/categories'
import { listBudgets } from '@/server/budgets'
import { CategorisedRow, CategorizeNow, type TxView } from './client'
import { ViewSwitch, YearView } from './year'

export const metadata: Metadata = { title: 'Transactions · Hearthside' }
export const dynamic = 'force-dynamic'

const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const TREND_MONTHS = 6
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const selectClass = 'min-h-11 w-full min-w-0 rounded-md border border-line bg-surface-2 px-3'

type Search = Record<string, string | string[] | undefined>

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const params = await searchParams
  const one = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : undefined)

  const [months, allAccounts, people] = await Promise.all([
    listMonths(db, member),
    listAccounts(db, member),
    listMembers(db, household.id),
  ])
  const month = isMonth(one('month'))
    ? one('month')!
    : (months[0] ?? new Date().toISOString().slice(0, 7))
  const type = one('type') === 'card' || one('type') === 'bank' ? one('type') : undefined
  const holderId = people.some((p) => p.id === one('who')) ? one('who') : undefined
  const accounts = allAccounts.filter(
    (a) => (!type || a.kind === type) && (!holderId || holderOf(a) === holderId),
  )
  const accountId = accounts.some((a) => a.id === one('account')) ? one('account') : undefined
  const filter: TransactionFilter = {
    month,
    ...(type ? { kind: type as 'card' | 'bank' } : {}),
    ...(holderId ? { holderId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(one('category') ? { category: one('category')! } : {}),
    ...(one('q') ? { search: one('q')!.slice(0, 100) } : {}),
  }
  const query = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...(params as Record<string, string>), ...change }))
      if (typeof v === 'string' && v) p.set(k, v)
    return `/transactions?${p}`
  }
  const view = one('view') === 'year' ? 'year' : 'month'
  const yearParam = Number(one('year'))
  const year =
    Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? yearParam
      : Number(month.slice(0, 4))
  const switchHref = (v: 'month' | 'year') =>
    v === 'year'
      ? query({ view: 'year', year: month.slice(0, 4), category: '' })
      : query({
          view: '',
          year: '',
          month: String(year) === month.slice(0, 4) ? month : `${year}-12`,
        })
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) =>
    shiftMonth(month, i - TREND_MONTHS + 1),
  )
  // A budget line shows when one category is open across every account the member sees.
  const budgetCategory =
    filter.category && !type && !holderId && !accountId && !filter.search
      ? filter.category
      : undefined
  const [rows, sum, categories, trend, limits] = await Promise.all([
    listTransactions(db, member, filter),
    totals(db, member, filter),
    householdCategorySet(db, member.householdId),
    monthlySpending(db, member, filter, trendMonths),
    budgetCategory ? listBudgets(db, member) : [],
  ])
  const limit = limits.find((l) => l.category === budgetCategory)
  const budget = limit
    ? budgetMonth(
        [limit],
        { ...emptyFlow(month), byCategory: { [limit.category]: sum.spent } },
        new Date().toISOString().slice(0, 10),
      )
    : undefined
  const options = categories.all.map(({ slug, label, icon }) => ({ slug, label, icon }))
  const editable = canEdit(member)
  const kinds = new Set(allAccounts.map((a) => a.kind))
  const tabs = [
    { label: 'All', value: undefined },
    ...(kinds.has('card') ? [{ label: 'Cards', value: 'card' }] : []),
    ...(kinds.has('bank') ? [{ label: 'Bank accounts', value: 'bank' }] : []),
  ]
  if (view === 'year') {
    const yearFilter = { ...filter, month: undefined, category: undefined }
    return (
      <AppShell household={household.name} current="/transactions">
        <ViewSwitch view="year" href={switchHref} />
        {tabs.length > 2 && <KindTabs tabs={tabs} type={type} query={query} />}
        <YearView
          db={db}
          member={member}
          year={year}
          filter={yearFilter}
          categories={categories}
          query={query}
        />
      </AppShell>
    )
  }
  const spent = Math.abs(sum.spent)
  const slices = sum.byCategory.map((c) => ({
    key: c.category ?? 'none',
    name: categories.label(c.category),
    minor: c.minor,
    href: query({ category: c.category ?? 'none' }),
  }))
  const bars = trend.map((m) => ({
    month: m.month,
    label: shortMonth.format(new Date(`${m.month}-01`)),
    minor: m.spent,
    href: query({ month: m.month }),
    current: m.month === month,
  }))
  const account = accountId ? allAccounts.find((a) => a.id === accountId) : undefined
  const accountNames = new Map(allAccounts.map((a) => [a.id, a.name]))
  const views: TxView[] = rows.map(({ t, accountName, accountProvider, accountColor }) => ({
    id: t.id,
    accountColor: accountLook({
      name: accountName,
      provider: accountProvider,
      color: accountColor,
    }).color,
    description: t.description,
    meta: [
      accountName,
      day.format(new Date(t.occurredOn)),
      ...(t.cardBill
        ? [
            cardBillNote(
              t.amountMinor,
              t.cardBillExpectedMinor,
              t.cardBillAccountId ? accountNames.get(t.cardBillAccountId) : null,
            ),
          ]
        : []),
    ].join(' · '),
    minor: t.amountMinor,
    category: t.category,
    label: categories.label(t.category),
    icon: categories.icon(t.category),
    ...(t.categorySource === 'auto' ? { auto: true } : {}),
    ...(t.alert && !t.alertDismissedAt ? { alert: ALERT_LABELS[t.alert] } : {}),
    ...(t.originalMinor != null && t.originalCurrency
      ? { original: { minor: t.originalMinor, currency: t.originalCurrency } }
      : {}),
    ...(t.installmentN && t.installmentTotal
      ? { installment: { n: t.installmentN, total: t.installmentTotal } }
      : {}),
  }))
  const label = monthName.format(new Date(`${month}-01`))
  // Filters other than search, to open the filter panel when any is on.
  const narrowed = [holderId, accountId, filter.category].filter(Boolean).length

  return (
    <AppShell household={household.name} current="/transactions">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={query({ month: shiftMonth(month, -1) })}
          aria-label="Previous month"
          className={buttonClasses('ghost')}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="font-display text-title">{label}</h1>
        <Link
          href={query({ month: shiftMonth(month, 1) })}
          aria-label="Next month"
          className={buttonClasses('ghost')}
        >
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <ViewSwitch view="month" href={switchHref} />
      {tabs.length > 2 && <KindTabs tabs={tabs} type={type} query={query} />}

      <Card
        className="min-w-0"
        aria-label={type === 'bank' ? `Money out in ${label}` : `Spent in ${label}`}
      >
        <Label>
          {account
            ? `${account.name} · ${label}`
            : type === 'bank'
              ? `Money out in ${label}`
              : `Spent in ${label}`}
        </Label>
        <Amount minor={-spent} whole hero />
        <SpendingBreakdown
          slices={slices}
          months={bars}
          center={
            <span className="grid leading-tight">
              <span className="font-display text-heading">{sum.count}</span>
              <span className="text-caption text-ink-muted">
                {sum.count === 1 ? 'transaction' : 'transactions'}
              </span>
            </span>
          }
        />
      </Card>
      {budget?.lines[0] && (
        <Card aria-label="Budget" data-testid="category-budget">
          <Link
            href={`/budgets?month=${month}`}
            className="block rounded-md focus-visible:outline-2 focus-visible:outline-focus"
          >
            <BudgetLineView
              line={budget.lines[0]}
              categories={categories}
              elapsed={budget.elapsed}
            />
          </Link>
        </Card>
      )}
      {(sum.received > 0 || sum.cardBills < 0) && (
        <p className="-mt-3 grid gap-1 text-caption text-ink-muted">
          {sum.received > 0 && (
            <span>
              Money in: <Amount minor={sum.received} signed whole className="text-caption" />
              {' · '}Left:{' '}
              <Amount minor={sum.received + sum.spent} signed whole className="text-caption" />
            </span>
          )}
          {sum.cardBills < 0 && (
            <span data-testid="card-bills">
              Card bills paid from the bank (
              <Amount minor={sum.cardBills} whole className="text-caption" />) aren’t counted again,
              since the card purchases already are.
            </span>
          )}
        </p>
      )}

      <form className="grid gap-2" action="/transactions" role="search">
        <input type="hidden" name="month" value={month} />
        {type && <input type="hidden" name="type" value={type} />}
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search</span>
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              name="q"
              type="search"
              defaultValue={filter.search ?? ''}
              className={`${selectClass} w-full ps-10`}
              placeholder="Search descriptions"
            />
          </label>
          <button type="submit" className={buttonClasses('secondary')}>
            Filter
          </button>
        </div>
        <details className="group" open={narrowed > 0}>
          <summary className="cursor-pointer text-body-strong text-brand-ink">
            {narrowed ? `Filters · ${narrowed} on` : 'More filters'}
          </summary>
          <div
            className={`grid gap-2 pt-2 ${people.length > 1 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
          >
            {people.length > 1 && (
              <label className="grid gap-1">
                <span className="text-caption text-ink-muted">Whose</span>
                <select name="who" defaultValue={holderId ?? ''} className={selectClass}>
                  <option value="">Everyone</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id === member.id ? `${p.name} (you)` : p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">Account</span>
              <select name="account" defaultValue={accountId ?? ''} className={selectClass}>
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">Category</span>
              <select name="category" defaultValue={filter.category ?? ''} className={selectClass}>
                <option value="">All categories</option>
                <option value="none">Uncategorized</option>
                <option value="alerts">Alerts to check</option>
                {categories.all.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
      </form>

      <Card aria-labelledby="list-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label id="list-title">
            {sum.count} {sum.count === 1 ? 'transaction' : 'transactions'}
          </Label>
          {editable && views.some((v) => !v.category) && <CategorizeNow />}
        </div>
        {views.length === 0 ? (
          <div className="grid gap-3">
            <p className="text-ink-muted">Nothing here for {label}.</p>
            {editable && (
              <Link href="/import" className={`${buttonClasses('secondary')} justify-self-start`}>
                <FileUp aria-hidden />
                Import a statement
              </Link>
            )}
          </div>
        ) : (
          <TransactionList className="-mx-2" data-testid="transactions">
            {views.map((tx) => (
              <CategorisedRow key={tx.id} tx={tx} editable={editable} options={options} />
            ))}
          </TransactionList>
        )}
      </Card>
    </AppShell>
  )
}

function KindTabs({
  tabs,
  type,
  query,
}: {
  tabs: { label: string; value: string | undefined }[]
  type: string | undefined
  query: (change: Record<string, string | undefined>) => string
}) {
  return (
    <nav aria-label="Account type" className="flex gap-1 rounded-md bg-surface-2 p-1">
      {tabs.map((t) => (
        <Link
          key={t.label}
          href={query({ type: t.value ?? '', account: '' })}
          aria-current={type === t.value ? 'page' : undefined}
          className="flex min-h-11 flex-1 items-center justify-center rounded-sm px-2 text-center text-body-strong text-ink-muted aria-[current=page]:bg-surface-1 aria-[current=page]:text-ink aria-[current=page]:shadow-card"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
