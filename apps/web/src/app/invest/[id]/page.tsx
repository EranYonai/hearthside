import { assetClassLabel, summarizePortfolio } from '@hearthside/core'
import { Amount, buttonClasses, Card, Label, Notice } from '@hearthside/ui'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { currentRates } from '@/server/fx'
import {
  getVisibleInvestmentAccount,
  investmentHolder,
  listHoldings,
  mayManage,
} from '@/server/invest'
import { AuthError, listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import {
  DeleteAccountButton,
  HoldingForm,
  InvestmentAccountForm,
  RemoveHoldingButton,
} from '../client'

export const metadata: Metadata = { title: 'Investment account · Hearthside' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

function formatUnits(units: string): string {
  const [whole, frac] = units.split('.')
  return `${BigInt(whole!).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}

export default async function InvestmentAccountPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { id } = await params
  const account = await getVisibleInvestmentAccount(db, member, id).catch((err: unknown) => {
    if (err instanceof AuthError) notFound()
    throw err
  })
  const [list, people] = await Promise.all([
    listHoldings(db, member, [account.id]),
    listMembers(db, household.id),
  ])
  const { rates } = await currentRates(db)
  const summary = summarizePortfolio(list, account.currency, rates)
  const unconverted = Object.entries(summary.unconverted)
  const manage = mayManage(member, account)
  const holder = people.find((p) => p.id === investmentHolder(account))

  return (
    <AppShell household={household.name} current="/invest">
      <Link href="/invest" className={`${buttonClasses('ghost')} justify-self-start`}>
        <ChevronLeft aria-hidden />
        Investments
      </Link>
      <div className="grid gap-1">
        <h1 className="font-display text-title">{account.name}</h1>
        <p className="text-caption text-ink-muted">
          {[
            holder ? (holder.id === member.id ? 'Yours' : holder.name) : 'Former member',
            account.provider,
            account.currency,
            account.visibility === 'private' ? 'Private' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card aria-labelledby="value-title">
        <Label id="value-title">Value</Label>
        <Amount minor={summary.totalMinor} currency={account.currency} whole hero />
        {unconverted.length > 0 && (
          <p className="text-caption text-ink-muted">
            Plus{' '}
            {unconverted.map(([c, minor], i) => (
              <span key={c}>
                {i > 0 && ', '}
                <Amount minor={minor} currency={c} whole className="text-caption" />
              </span>
            ))}{' '}
            in currencies without a rate yet.
          </p>
        )}
      </Card>

      <Card aria-labelledby="holdings-title" className="gap-0">
        <h2 id="holdings-title" className="pb-2 font-display text-heading">
          Holdings
        </h2>
        {list.length === 0 && <p className="text-ink-muted">No holdings yet.</p>}
        <ul data-testid="holdings">
          {list.map((h) => (
            <li key={h.id} className="border-t border-line py-2 first:border-t-0">
              <details>
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3">
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-body-strong">{h.name}</span>
                    <span className="text-caption text-ink-muted">
                      {h.kind === 'cash'
                        ? 'Cash'
                        : `${h.symbol} · ${formatUnits(h.units)} units · ${assetClassLabel(h.assetClass)}`}
                    </span>
                  </span>
                  <span className="grid text-end">
                    {h.valueMinor === null ? (
                      <span className="text-caption text-ink-muted">No price yet</span>
                    ) : (
                      <Amount
                        minor={h.valueMinor}
                        currency={h.currency}
                        whole
                        className="text-body-strong"
                      />
                    )}
                    {h.kind === 'security' && h.price && (
                      <span className="text-caption text-ink-muted">
                        {h.price} {h.currency}
                        {h.priceSource === 'manual' && h.pricedAt
                          ? ` · you, ${dateFormat.format(h.pricedAt)}`
                          : ''}
                      </span>
                    )}
                  </span>
                </summary>
                {manage && (
                  <div className="grid gap-3 pt-3">
                    <HoldingForm
                      accountId={account.id}
                      accountCurrency={account.currency}
                      holding={{
                        kind: h.kind,
                        symbol: h.symbol,
                        name: h.name,
                        currency: h.currency,
                        assetClass: h.assetClass,
                        units: h.units,
                      }}
                    />
                    <div className="justify-self-start">
                      <RemoveHoldingButton accountId={account.id} holdingId={h.id} name={h.name} />
                    </div>
                  </div>
                )}
              </details>
            </li>
          ))}
        </ul>
      </Card>

      {manage ? (
        <>
          <Card aria-labelledby="add-holding-title">
            <details open={list.length === 0}>
              <summary
                id="add-holding-title"
                className="cursor-pointer text-body-strong text-brand-ink"
              >
                Add a holding by hand
              </summary>
              <div className="pt-3">
                <HoldingForm accountId={account.id} accountCurrency={account.currency} />
              </div>
            </details>
          </Card>
          <Card aria-labelledby="edit-title">
            <details>
              <summary id="edit-title" className="cursor-pointer text-body-strong text-brand-ink">
                Account details
              </summary>
              <div className="grid gap-6 pt-3">
                <InvestmentAccountForm
                  account={{
                    id: account.id,
                    name: account.name,
                    provider: account.provider,
                    currency: account.currency,
                    visibility: account.visibility,
                    holderId: investmentHolder(account),
                  }}
                  people={people
                    .filter((p) => p.role !== 'viewer' || p.id === investmentHolder(account))
                    .map((p) => ({
                      id: p.id,
                      name: p.id === member.id ? `${p.name} (you)` : p.name,
                    }))}
                  selfId={member.id}
                  defaultCurrency={account.currency}
                />
                <DeleteAccountButton id={account.id} />
              </div>
            </details>
          </Card>
        </>
      ) : (
        <Notice tone="info">Only the person whose account this is can change it.</Notice>
      )}
    </AppShell>
  )
}
