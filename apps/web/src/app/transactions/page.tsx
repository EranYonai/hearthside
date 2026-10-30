import { CATEGORIES, categoryLabel } from '@hearthside/core'
import { Amount, buttonClasses, Card, Label, SummaryCard, TransactionList } from '@hearthside/ui'
import { ChevronLeft, ChevronRight, FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import {
  canEdit,
  listAccounts,
  listMonths,
  listTransactions,
  monthRange,
  totals,
  type TransactionFilter,
} from '@/server/ledger'
import { requireSession } from '@/server/session'
import { CategorisedRow, type TxView } from './client'

export const metadata: Metadata = { title: 'Transactions · Hearthside' }
export const dynamic = 'force-dynamic'

const monthName = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const selectClass = 'min-h-11 rounded-md border border-line bg-surface-2 px-3'

function shift(month: string, by: number) {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

function isMonth(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    monthRange(v)
    return true
  } catch {
    return false
  }
}

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

  const [months, accounts] = await Promise.all([listMonths(db, member), listAccounts(db, member)])
  const month = isMonth(one('month'))
    ? one('month')!
    : (months[0] ?? new Date().toISOString().slice(0, 7))
  const accountId = accounts.some((a) => a.id === one('account')) ? one('account') : undefined
  const filter: TransactionFilter = {
    month,
    ...(accountId ? { accountId } : {}),
    ...(one('category') ? { category: one('category')! } : {}),
    ...(one('q') ? { search: one('q')!.slice(0, 100) } : {}),
  }
  const [rows, sum] = await Promise.all([
    listTransactions(db, member, filter),
    totals(db, member, filter),
  ])
  const editable = canEdit(member)
  const query = (m: string) => {
    const p = new URLSearchParams({ ...(params as Record<string, string>), month: m })
    return `/transactions?${p}`
  }
  const spent = Math.abs(sum.spent)
  const segments = sum.byCategory.map((c) => ({
    name: categoryLabel(c.category),
    minor: Math.abs(c.minor),
    percent: spent ? (Math.abs(c.minor) / spent) * 100 : 0,
  }))
  const views: TxView[] = rows.map(({ t, accountName }) => ({
    id: t.id,
    description: t.description,
    meta: `${accountName} · ${day.format(new Date(t.occurredOn))}`,
    minor: t.amountMinor,
    category: t.category,
    ...(t.originalMinor != null && t.originalCurrency
      ? { original: { minor: t.originalMinor, currency: t.originalCurrency } }
      : {}),
    ...(t.installmentN && t.installmentTotal
      ? { installment: { n: t.installmentN, total: t.installmentTotal } }
      : {}),
  }))
  const label = monthName.format(new Date(`${month}-01`))

  return (
    <AppShell household={household.name} current="/transactions">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={query(shift(month, -1))}
          aria-label="Previous month"
          className={buttonClasses('ghost')}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="font-display text-title">{label}</h1>
        <Link
          href={query(shift(month, 1))}
          aria-label="Next month"
          className={buttonClasses('ghost')}
        >
          <ChevronRight aria-hidden />
        </Link>
      </div>

      <SummaryCard label={`Spent in ${label}`} minor={-spent} segments={segments} />
      {sum.received > 0 && (
        <p className="-mt-3 text-caption text-ink-muted">
          Money in: <Amount minor={sum.received} signed whole className="text-caption" />
        </p>
      )}

      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        action="/transactions"
        role="search"
      >
        <input type="hidden" name="month" value={month} />
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
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-caption text-ink-muted">Search</span>
          <input
            name="q"
            type="search"
            defaultValue={filter.search ?? ''}
            className={selectClass}
            placeholder="Description"
          />
        </label>
        <button type="submit" className={`${buttonClasses('secondary')} self-end`}>
          Filter
        </button>
      </form>

      <Card aria-labelledby="list-title">
        <Label id="list-title">
          {sum.count} {sum.count === 1 ? 'transaction' : 'transactions'}
        </Label>
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
              <CategorisedRow key={tx.id} tx={tx} editable={editable} />
            ))}
          </TransactionList>
        )}
      </Card>
    </AppShell>
  )
}
