import { Amount, Card, Label } from '@hearthside/ui'
import { ChevronRight, Lock } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { canEdit } from '@/server/ledger'
import { investmentHolder, portfolio } from '@/server/invest'
import { listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { InvestmentAccountForm } from './client'

export const metadata: Metadata = { title: 'Invest · Hearthside' }
export const dynamic = 'force-dynamic'

const SLICE_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']

export default async function InvestPage() {
  const { member, household } = await requireSession()
  const db = requireDb()
  const [{ accounts, holdings, summary, allocation }, people] = await Promise.all([
    portfolio(db, member),
    listMembers(db, household.id),
  ])
  const names = new Map(people.map((p) => [p.id, p.id === member.id ? 'You' : p.name]))
  const currency = summary.currency
  const unconverted = Object.entries(summary.unconverted)
  const editable = canEdit(member)

  return (
    <AppShell household={household.name} current="/invest">
      <h1 className="font-display text-title">Investments</h1>

      {accounts.length === 0 ? (
        <Card>
          <p>
            Keep all your investment accounts in one place: what you hold, what it’s worth, and how
            it’s split.
          </p>
          {!editable && (
            <p className="text-ink-muted">Nothing here yet. Someone in your home can add one.</p>
          )}
        </Card>
      ) : (
        <>
          <Card aria-labelledby="value-title">
            <Label id="value-title">Portfolio value</Label>
            <Amount minor={summary.totalMinor} currency={currency} whole hero />
            {unconverted.length > 0 && (
              <p className="text-caption text-ink-muted" data-testid="unconverted">
                Plus{' '}
                {unconverted.map(([c, minor], i) => (
                  <span key={c}>
                    {i > 0 && ', '}
                    <Amount minor={minor} currency={c} whole className="text-caption" />
                  </span>
                ))}{' '}
                not converted to {currency} yet.
              </p>
            )}
            {summary.unpriced > 0 && (
              <p className="text-caption text-ink-muted">
                {summary.unpriced === 1
                  ? '1 holding has no price yet.'
                  : `${summary.unpriced} holdings have no price yet.`}
              </p>
            )}
          </Card>

          {allocation.length > 0 && (
            <Card aria-labelledby="allocation-title">
              <h2 id="allocation-title" className="font-display text-heading">
                Allocation
              </h2>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-pill" aria-hidden>
                {allocation.map((s, i) => (
                  <span
                    key={s.slug}
                    className={`block h-full ${SLICE_COLORS[i] ?? 'bg-chart-other'}`}
                    style={{ width: `${s.percent}%` }}
                  />
                ))}
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5" data-testid="allocation">
                {allocation.map((s, i) => (
                  <li key={s.slug} className="flex items-center gap-2 text-caption text-ink-muted">
                    <span
                      className={`size-2 rounded-xs ${SLICE_COLORS[i] ?? 'bg-chart-other'}`}
                      aria-hidden
                    />
                    {s.label} <b className="font-display text-ink tabular-nums">{s.percent}%</b>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card aria-labelledby="accounts-title" className="gap-0">
            <h2 id="accounts-title" className="pb-2 font-display text-heading">
              Accounts
            </h2>
            <ul data-testid="investment-accounts">
              {accounts.map((a) => {
                const count = holdings.filter((h) => h.accountId === a.id).length
                const who = names.get(investmentHolder(a)) ?? 'Former member'
                return (
                  <li key={a.id} className="border-t border-line first:border-t-0">
                    <Link
                      href={`/invest/${a.id}`}
                      className="flex min-h-14 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      <span className="grid flex-1">
                        <span className="flex items-center gap-1.5 text-body-strong">
                          {a.name}
                          {a.visibility === 'private' && (
                            <Lock size={14} aria-label="Private" className="text-ink-muted" />
                          )}
                        </span>
                        <span className="text-caption text-ink-muted">
                          {[who, a.provider, `${count} ${count === 1 ? 'holding' : 'holdings'}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <Amount
                        minor={summary.byAccount[a.id] ?? 0}
                        currency={currency}
                        whole
                        className="text-body-strong"
                      />
                      <ChevronRight size={20} aria-hidden className="text-ink-muted" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}

      {editable && (
        <Card aria-labelledby="add-title">
          <details open={accounts.length === 0}>
            <summary id="add-title" className="cursor-pointer text-body-strong text-brand-ink">
              Add an investment account
            </summary>
            <div className="pt-3">
              <InvestmentAccountForm
                people={people
                  .filter((p) => p.role !== 'viewer' || p.id === member.id)
                  .map((p) => ({
                    id: p.id,
                    name: p.id === member.id ? `${p.name} (you)` : p.name,
                  }))}
                selfId={member.id}
                defaultCurrency={member.displayCurrency}
              />
            </div>
          </details>
        </Card>
      )}
    </AppShell>
  )
}
