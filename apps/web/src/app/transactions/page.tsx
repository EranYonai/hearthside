import { cardBillNote } from '@hearthside/core'
import { Amount, buttonClasses, Card, Label, SummaryCard, TransactionList } from '@hearthside/ui'
import { ChevronLeft, ChevronRight, FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { isMonth, monthName, shiftMonth } from '@/lib/month'
import {
  canEdit,
  holderOf,
  listAccounts,
  listMonths,
  listTransactions,
  totals,
  type TransactionFilter,
} from '@/server/ledger'
import { listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { householdCategorySet } from '@/server/categories'
import { CategorisedRow, CategorizeNow, type TxView } from './client'

export const metadata: Metadata = { title: 'Transactions · Hearthside' }
export const dynamic = 'force-dynamic'

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const selectClass = 'min-h-11 rounded-md border border-line bg-surface-2 px-3'

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
  const [rows, sum, categories] = await Promise.all([
    listTransactions(db, member, filter),
    totals(db, member, filter),
    householdCategorySet(db, member.householdId),
  ])
  const options = categories.all.map(({ slug, label, icon }) => ({ slug, label, icon }))
  const editable = canEdit(member)
  const query = (change: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...(params as Record<string, string>), ...change }))
      if (typeof v === 'string' && v) p.set(k, v)
    return `/transactions?${p}`
  }
  const kinds = new Set(allAccounts.map((a) => a.kind))
  const tabs = [
    { label: 'All', value: undefined },
    ...(kinds.has('card') ? [{ label: 'Cards', value: 'card' }] : []),
    ...(kinds.has('bank') ? [{ label: 'Bank accounts', value: 'bank' }] : []),
  ]
  const spent = Math.abs(sum.spent)
  const segments = sum.byCategory.map((c) => ({
    name: categories.label(c.category),
    minor: Math.abs(c.minor),
    percent: spent ? (Math.abs(c.minor) / spent) * 100 : 0,
  }))
  const accountNames = new Map(allAccounts.map((a) => [a.id, a.name]))
  const views: TxView[] = rows.map(({ t, accountName }) => ({
    id: t.id,
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

      {tabs.length > 2 && (
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
      )}

      <SummaryCard
        label={type === 'bank' ? `Money out in ${label}` : `Spent in ${label}`}
        minor={-spent}
        segments={segments}
      />
      {(sum.received > 0 || sum.cardBills < 0) && (
        <p className="-mt-3 grid gap-1 text-caption text-ink-muted">
          {sum.received > 0 && (
            <span>
              Money in: <Amount minor={sum.received} signed whole className="text-caption" />
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

      <form
        className={`grid gap-2 ${people.length > 1 ? 'sm:grid-cols-[1fr_1fr_1fr_1fr_auto]' : 'sm:grid-cols-[1fr_1fr_1fr_auto]'}`}
        action="/transactions"
        role="search"
      >
        <input type="hidden" name="month" value={month} />
        {type && <input type="hidden" name="type" value={type} />}
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
            {categories.all.map((c) => (
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
