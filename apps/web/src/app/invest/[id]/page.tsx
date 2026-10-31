import { assetClassLabel, movementLabel, summarizePortfolio } from '@hearthside/core'
import { Amount, buttonClasses, Card, Label, Notice } from '@hearthside/ui'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { LocalTime } from '@/lib/LocalTime'
import { currentRates } from '@/server/fx'
import { keepQuotesFresh } from '@/server/prices'
import {
  getVisibleInvestmentAccount,
  investmentHolder,
  listHoldings,
  mayManage,
} from '@/server/invest'
import { AuthError, listMembers } from '@/server/repo'
import { dayOf, listMovements, trends } from '@/server/trends'
import { ValueChart } from '@/components/ValueChart'
import { requireSession } from '@/server/session'
import {
  DeleteAccountButton,
  HoldingForm,
  HoldingsImport,
  InvestmentAccountForm,
  MovementForm,
  RemoveHoldingButton,
  RemoveMovementButton,
} from '../client'

export const metadata: Metadata = { title: 'Investment account · Hearthside' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatUnits(units: string): string {
  const [whole, frac] = units.split('.')
  return `${BigInt(whole!).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}

export default async function InvestmentAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { id } = await params
  const editing = (await searchParams).edit === '1'
  const account = await getVisibleInvestmentAccount(db, member, id).catch((err: unknown) => {
    if (err instanceof AuthError) notFound()
    throw err
  })
  await keepQuotesFresh(db)
  const [list, people, movements] = await Promise.all([
    listHoldings(db, member, [account.id]),
    listMembers(db, household.id),
    listMovements(db, member, [account.id]),
  ])
  const { rates } = await currentRates(db)
  const summary = summarizePortfolio(list, account.currency, rates)
  const trend = await trends(db, member, '6m', rates, undefined, {
    accountIds: [account.id],
    currency: account.currency,
  })
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
        <ValueChart trend={trend} compact />
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
                      <span className="text-caption text-ink-muted">
                        {h.quoteStatus === 'not_found' ? 'No market price found' : 'No price yet'}
                      </span>
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
                        {h.changeMinor !== null && h.changeMinor !== 0 && (
                          <>
                            {' · '}
                            <Amount
                              minor={h.changeMinor}
                              currency={h.currency}
                              signed
                              whole
                              className="text-caption"
                            />
                          </>
                        )}
                        {h.pricedAt && (
                          <>
                            {h.priceSource === 'manual' ? ' · you, ' : ' · '}
                            <LocalTime iso={h.pricedAt.toISOString()} />
                          </>
                        )}
                      </span>
                    )}
                  </span>
                </summary>
                <div className="grid gap-3 pt-3">
                  <Link
                    href={`/invest/holding/${h.id}`}
                    className="inline-flex min-h-11 items-center gap-1 justify-self-start text-body-strong text-brand-ink underline"
                  >
                    {h.kind === 'security' ? 'Price history and fund facts' : 'Details'}
                  </Link>
                  {manage && (
                    <>
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
                        <RemoveHoldingButton
                          accountId={account.id}
                          holdingId={h.id}
                          name={h.name}
                        />
                      </div>
                    </>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="movements-title">
        <h2 id="movements-title" className="font-display text-heading">
          Money in and out
        </h2>
        <p className="text-caption text-ink-muted">
          Deposits and withdrawals show how much you put in, so trends can tell growth from new
          money. Fees and dividends are listed per year.
        </p>
        {movements.length > 0 && (
          <ul data-testid="movements">
            {movements.map((m) => (
              <li
                key={m.id}
                className="flex min-h-11 items-center gap-3 border-t border-line py-1 first:border-t-0"
              >
                <span className="grid flex-1">
                  <span className="text-body-strong">{movementLabel(m.kind)}</span>
                  <span className="text-caption text-ink-muted">
                    {dateFormat.format(new Date(`${m.on}T00:00:00Z`))}
                  </span>
                </span>
                <Amount minor={m.amountMinor} currency={m.currency} signed />
                {manage && m.source === 'manual' && (
                  <RemoveMovementButton
                    accountId={account.id}
                    id={m.id}
                    label={`${movementLabel(m.kind).toLowerCase()} on ${m.on}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {manage && (
          <details open={movements.length === 0}>
            <summary className="cursor-pointer text-body-strong text-brand-ink">
              Add money in or out
            </summary>
            <div className="pt-3">
              <MovementForm
                accountId={account.id}
                currency={account.currency}
                today={dayOf(new Date())}
              />
            </div>
          </details>
        )}
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
          <Card aria-labelledby="import-title">
            <details>
              <summary id="import-title" className="cursor-pointer text-body-strong text-brand-ink">
                Import holdings from a file
              </summary>
              <div className="pt-3">
                <HoldingsImport accountId={account.id} />
              </div>
            </details>
          </Card>
          <Card aria-labelledby="edit-title">
            <details open={editing}>
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
