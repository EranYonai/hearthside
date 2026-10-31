import {
  assetClassLabel,
  convertMinor,
  HISTORY_RANGES,
  isHistoryRange,
  summarizePortfolio,
} from '@hearthside/core'
import { Amount, buttonClasses, Card, cx, Label } from '@hearthside/ui'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { LineChart } from '@/components/LineChart'
import { requireDb } from '@/lib/db'
import { LocalTime } from '@/lib/LocalTime'
import { currentRates } from '@/server/fx'
import { getHolding, listHoldings, mayManage } from '@/server/invest'
import { keepQuotesFresh, priceHistory } from '@/server/prices'
import { AuthError } from '@/server/repo'
import { requireSession } from '@/server/session'
import { FundFactsForm } from '../../client'

export const metadata: Metadata = { title: 'Holding · Hearthside' }
export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  ETF: 'Exchange-traded fund',
  MUTUALFUND: 'Mutual fund',
  EQUITY: 'Share',
  BOND: 'Bond',
  INDEX: 'Index',
}

function formatUnits(units: string): string {
  const [whole, frac] = units.split('.')
  return `${BigInt(whole!).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}

function priceText(price: string, currency: string): string {
  const n = Number(price)
  return new Intl.NumberFormat('en-IL', {
    style: 'currency',
    currencyDisplay: 'narrowSymbol',
    currency,
    maximumFractionDigits: n >= 100 ? 2 : 4,
  }).format(n)
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-body-strong">{children}</dd>
    </div>
  )
}

export default async function HoldingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { id } = await params
  const query = await searchParams
  const range = isHistoryRange(query.range) ? query.range : '1y'
  await keepQuotesFresh(db)
  const { holding: h, account } = await getHolding(db, member, id).catch((err: unknown) => {
    if (err instanceof AuthError) notFound()
    throw err
  })
  const security = h.kind === 'security'
  const [history, all, { rates }] = await Promise.all([
    security ? priceHistory(db, { ...h, id: h.instrumentId }, range) : null,
    listHoldings(db, member),
    currentRates(db),
  ])
  const total = summarizePortfolio(all, member.displayCurrency, rates).totalMinor
  const mine =
    h.valueMinor === null
      ? null
      : convertMinor(h.valueMinor, h.currency, member.displayCurrency, rates)
  const share = mine !== null && total > 0 ? (mine / total) * 100 : null
  const gain = h.valueMinor !== null && h.costMinor !== null ? h.valueMinor - h.costMinor : null
  const manage = mayManage(member, account)
  const facts = h.facts
  const first = history?.points[0]
  const last = history?.points.at(-1)
  const move = first && last ? Number(last.price) / Number(first.price) - 1 : null

  return (
    <AppShell household={household.name} current="/invest">
      <Link
        href={`/invest/${account.id}`}
        className={`${buttonClasses('ghost')} justify-self-start`}
      >
        <ChevronLeft aria-hidden />
        {account.name}
      </Link>
      <div className="grid gap-1">
        <h1 className="font-display text-title">{h.name}</h1>
        <p className="text-caption text-ink-muted">
          {[
            security ? h.symbol : 'Cash',
            assetClassLabel(h.assetClass),
            h.currency,
            history?.exchange,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card aria-labelledby="position-title">
        <Label id="position-title">Position</Label>
        <Amount minor={h.valueMinor ?? 0} currency={h.currency} hero />
        <dl className="grid grid-cols-2 gap-3">
          <Fact label={security ? 'Units' : 'Balance'}>{formatUnits(h.units)}</Fact>
          {security && (
            <Fact label="Price">
              {h.price ? priceText(h.price, h.currency) : '–'}
              {h.pricedAt && (
                <span className="block text-caption font-normal text-ink-muted">
                  {h.priceSource === 'manual' ? 'typed in, ' : ''}
                  <LocalTime iso={h.pricedAt.toISOString()} />
                </span>
              )}
            </Fact>
          )}
          {h.costMinor !== null && (
            <Fact label="Paid">
              <Amount minor={h.costMinor} currency={h.currency} whole />
            </Fact>
          )}
          {gain !== null && (
            <Fact label="Gain">
              <Amount minor={gain} currency={h.currency} signed whole />
            </Fact>
          )}
          {share !== null && (
            <Fact label="Of your portfolio">
              <span data-testid="portfolio-share">{share.toFixed(1)}%</span>
            </Fact>
          )}
        </dl>
      </Card>

      {security && history && (
        <Card aria-labelledby="history-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="history-title" className="font-display text-heading">
              Price history
            </h2>
            <nav aria-label="Price range" className="flex gap-1">
              {HISTORY_RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`/invest/holding/${h.id}?range=${r.key}`}
                  aria-current={r.key === range ? 'page' : undefined}
                  className={cx(
                    'grid min-h-11 min-w-11 place-items-center rounded-pill px-2 text-caption font-semibold',
                    r.key === range
                      ? 'bg-brand text-on-brand'
                      : 'text-ink-muted hover:bg-surface-2',
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </nav>
          </div>
          {history.points.length > 1 ? (
            <>
              <LineChart
                label={`${h.name} price over time`}
                kind="price"
                currency={h.currency}
                points={history.points.map((p) => ({ on: p.on, values: [Number(p.price)] }))}
                series={[{ label: 'Price', color: 'chart-1' }]}
              />
              {move !== null && (
                <p className="text-caption text-ink-muted" data-testid="price-move">
                  {move >= 0 ? '+' : '−'}
                  {Math.abs(move * 100).toFixed(1)}% over this range
                  {history.from === 'stored' && ', from prices recorded here'}.
                </p>
              )}
            </>
          ) : (
            <p className="text-ink-muted" data-testid="no-history">
              No price history yet. It comes from the quote source when it knows this symbol, or
              builds up from the prices recorded here.
            </p>
          )}
        </Card>
      )}

      {security && (
        <Card aria-labelledby="facts-title">
          <h2 id="facts-title" className="font-display text-heading">
            Fund facts
          </h2>
          <dl className="grid grid-cols-2 gap-3" data-testid="fund-facts">
            <Fact label="Yearly fee">{facts?.fee ? `${facts.fee}%` : '–'}</Fact>
            <Fact label="Type">
              {history?.type ? (TYPE_LABEL[history.type] ?? history.type) : '–'}
            </Fact>
            <Fact label="Index it tracks">{facts?.index ?? '–'}</Fact>
            <Fact label="Domicile">{facts?.domicile ?? '–'}</Fact>
          </dl>
          {facts && facts.documents.length > 0 && (
            <ul className="grid gap-1" data-testid="fund-documents">
              {facts.documents.map((d) => (
                <li key={d.url}>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex min-h-11 items-center gap-1.5 text-body-strong text-brand-ink underline"
                  >
                    {d.label}
                    <ExternalLink size={14} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {manage && (
            <details>
              <summary className="cursor-pointer text-body-strong text-brand-ink">
                Edit fund facts
              </summary>
              <div className="pt-3">
                <FundFactsForm holdingId={h.id} facts={facts} />
              </div>
            </details>
          )}
          <p className="text-caption text-ink-muted">
            Find the fee, index and documents on the fund manager’s site. Links open there; nothing
            about you is sent.
          </p>
        </Card>
      )}
    </AppShell>
  )
}
