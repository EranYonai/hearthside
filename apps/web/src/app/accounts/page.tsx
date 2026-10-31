import { providerLabel } from '@hearthside/core'
import { Amount, buttonClasses, Card, Label } from '@hearthside/ui'
import { ChevronLeft, ChevronRight, FileUp, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AccountCard } from '@/components/AccountCard'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { isMonth, monthName, shiftMonth } from '@/lib/month'
import { currentRates } from '@/server/fx'
import { investmentHolder, mayManage, portfolio } from '@/server/invest'
import { accountSummaries, canEdit, holderOf, listMonths } from '@/server/ledger'
import { listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { AccountForm } from '../import/client'

export const metadata: Metadata = { title: 'Accounts · Hearthside' }
export const dynamic = 'force-dynamic'

const SECTIONS = [
  { kind: 'card', title: 'Cards', total: 'Spent' },
  { kind: 'bank', title: 'Bank accounts', total: 'Money out' },
  { kind: 'other', title: 'Other', total: 'Money out' },
] as const

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const params = await searchParams
  const months = await listMonths(db, member)
  const month = isMonth(params.month)
    ? params.month
    : (months[0] ?? new Date().toISOString().slice(0, 7))
  const [summaries, people, fx] = await Promise.all([
    accountSummaries(db, member, month),
    listMembers(db, household.id),
    currentRates(db),
  ])
  const invest = await portfolio(db, member, fx.rates)
  const names = new Map(people.map((p) => [p.id, p.id === member.id ? 'You' : p.name]))
  const label = monthName.format(new Date(`${month}-01`))
  const editable = canEdit(member)

  return (
    <AppShell household={household.name} current="/accounts">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/accounts?month=${shiftMonth(month, -1)}`}
          aria-label="Previous month"
          className={buttonClasses('ghost')}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h1 className="font-display text-title">Accounts · {label}</h1>
        <Link
          href={`/accounts?month=${shiftMonth(month, 1)}`}
          aria-label="Next month"
          className={buttonClasses('ghost')}
        >
          <ChevronRight aria-hidden />
        </Link>
      </div>

      {summaries.length === 0 && invest.accounts.length === 0 && (
        <Card>
          <p className="text-ink-muted">
            No accounts yet. Import a statement and its account is added for you.
          </p>
          {editable && (
            <Link href="/import" className={`${buttonClasses('primary')} justify-self-start`}>
              <FileUp aria-hidden />
              Import a statement
            </Link>
          )}
        </Card>
      )}

      {SECTIONS.map((section) => {
        const list = summaries.filter((s) => s.account.kind === section.kind)
        if (list.length === 0) return null
        const out = list.reduce((n, s) => n + s.out, 0)
        const into = list.reduce((n, s) => n + s.in, 0)
        return (
          <Card key={section.kind} aria-labelledby={`${section.kind}-title`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label id={`${section.kind}-title`}>{section.title}</Label>
              <span className="text-caption text-ink-muted">
                {section.total} <Amount minor={out} whole className="text-caption" />
                {section.kind !== 'card' && into > 0 && (
                  <>
                    {' · In '}
                    <Amount minor={into} signed whole className="text-caption" />
                  </>
                )}
              </span>
            </div>
            <ul
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              data-testid={`accounts-${section.kind}`}
            >
              {list.map(({ account: a, out: spent, count }) => {
                const who = names.get(holderOf(a))
                const mayEdit = editable && (a.ownerId === member.id || member.role === 'owner')
                return (
                  <li key={a.id} className="grid gap-1">
                    <Link
                      href={`/transactions?month=${month}&type=${a.kind === 'other' ? '' : a.kind}&account=${a.id}`}
                      aria-label={`${a.name}, ${count} transactions`}
                      className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <AccountCard
                        name={a.name}
                        kind={a.kind}
                        provider={providerLabel(a.provider)}
                        network={a.network}
                        last4={a.last4}
                        {...(a.visibility === 'private' ? { note: 'Private' } : {})}
                      />
                    </Link>
                    <span className="flex items-center justify-between gap-2 text-caption text-ink-muted">
                      <span className="truncate">
                        {who ?? 'Former member'} ·{' '}
                        <Amount minor={spent} whole className="text-caption" />
                      </span>
                      {mayEdit && (
                        <Link
                          href={`/accounts/${a.id}`}
                          aria-label={`Edit ${a.name}`}
                          className="grid size-11 place-items-center rounded-md text-brand-ink"
                        >
                          <Pencil size={16} aria-hidden />
                        </Link>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}

      {invest.accounts.length > 0 && (
        <Card aria-labelledby="investment-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label id="investment-title">Investments</Label>
            <span className="text-caption text-ink-muted">
              Value{' '}
              <Amount
                minor={invest.summary.totalMinor}
                currency={invest.summary.currency}
                whole
                className="text-caption"
              />
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="accounts-investment">
            {invest.accounts.map((a) => {
              const count = invest.holdings.filter((h) => h.accountId === a.id).length
              return (
                <li key={a.id} className="grid gap-1">
                  <Link
                    href={`/invest/${a.id}`}
                    aria-label={`${a.name}, ${count} ${count === 1 ? 'holding' : 'holdings'}`}
                    className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <AccountCard
                      name={a.name}
                      kind="investment"
                      provider={a.provider}
                      {...(a.visibility === 'private' ? { note: 'Private' } : {})}
                    />
                  </Link>
                  <span className="flex min-h-11 items-center justify-between gap-2 text-caption text-ink-muted">
                    <span className="truncate">
                      {names.get(investmentHolder(a)) ?? 'Former member'} ·{' '}
                      <Amount
                        minor={invest.summary.byAccount[a.id] ?? 0}
                        currency={invest.summary.currency}
                        whole
                        className="text-caption"
                      />
                    </span>
                    {mayManage(member, a) && (
                      <Link
                        href={`/invest/${a.id}?edit=1`}
                        aria-label={`Edit ${a.name}`}
                        className="grid size-11 place-items-center rounded-md text-brand-ink"
                      >
                        <Pencil size={16} aria-hidden />
                      </Link>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {editable && (
        <Card aria-labelledby="add-title">
          <details>
            <summary id="add-title" className="cursor-pointer text-body-strong text-brand-ink">
              Add an account by hand
            </summary>
            <div className="pt-3">
              <AccountForm />
            </div>
          </details>
        </Card>
      )}
    </AppShell>
  )
}
