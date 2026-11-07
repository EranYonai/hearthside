import {
  assetClassLabel,
  convertMinor,
  HISTORY_RANGES,
  isHistoryRange,
  summarizePortfolio,
} from '@hearthside/core'
import { Amount, Card, cx, Label } from '@hearthside/ui'
import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { LineChart } from '@/components/LineChart'
import { requireDb } from '@/lib/db'
import { LocalTime } from '@/lib/LocalTime'
import { currentRates } from '@/server/fx'
import { getHolding, holdingBuys, listHoldings, mayManage } from '@/server/invest'
import { localFund } from '@/server/local-funds'
import { keepQuotesFresh, keyStats, priceHistory } from '@/server/prices'
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

function compact(n: number, currency?: string): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
    ...(currency ? { style: 'currency', currency, currencyDisplay: 'narrowSymbol' } : {}),
  }).format(n)
}

function ratioText(ratio: number, digits = 2): string {
  return `${(ratio * 100).toFixed(digits).replace(/\.?0+$/, '')}%`
}

function percentText(ratio: number): string {
  return `${ratio >= 0 ? '+' : '−'}${Math.abs(ratio * 100).toFixed(1)}%`
}

function dayText(on: string): string {
  return new Date(`${on}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
  const [history, all, { rates }, lots, stats, local] = await Promise.all([
    security ? priceHistory(db, { ...h, id: h.instrumentId }, range) : null,
    listHoldings(db, member),
    currentRates(db),
    security ? holdingBuys(db, h) : null,
    security ? keyStats(h) : null,
    security ? localFund(h) : null,
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
    <AppShell
      household={household.name}
      current="/invest"
      back={{ href: `/invest/${account.id}`, label: account.name }}
    >
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

      {lots && (lots.buys.length > 0 || lots.rest) && (
        <Card aria-labelledby="buys-title">
          <h2 id="buys-title" className="font-display text-heading">
            Buys
          </h2>
          <ul className="grid divide-y divide-line" data-testid="buys">
            {lots.buys.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 py-2">
                <div className="grid gap-0.5">
                  <span className="text-body-strong">{dayText(b.on)}</span>
                  <span className="text-caption text-ink-muted">
                    {formatUnits(b.units)} at {priceText(b.paid, h.currency)}
                  </span>
                </div>
                <div className="grid justify-items-end gap-0.5 text-right">
                  {b.gainMinor !== null ? (
                    <>
                      <Amount minor={b.gainMinor} currency={h.currency} signed whole />
                      {b.gainRatio !== null && (
                        <span
                          className={cx(
                            'text-caption font-semibold',
                            b.gainRatio >= 0 ? 'text-positive' : 'text-negative',
                          )}
                        >
                          {percentText(b.gainRatio)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-caption text-ink-muted">No price yet</span>
                  )}
                </div>
              </li>
            ))}
            {lots.rest && (
              <li className="flex items-start justify-between gap-3 py-2">
                <div className="grid gap-0.5">
                  <span className="text-body-strong">Earlier units</span>
                  <span className="text-caption text-ink-muted">
                    {formatUnits(lots.rest.units)}
                    {lots.rest.costMinor !== null ? (
                      <>
                        , paid <Amount minor={lots.rest.costMinor} currency={h.currency} whole />
                      </>
                    ) : (
                      ', no buy price'
                    )}
                  </span>
                </div>
              </li>
            )}
          </ul>
          <p className="text-caption text-ink-muted">
            Each buy’s gain is today’s price against what you paid, before fees and dividends.
          </p>
        </Card>
      )}

      {(stats || local) && (
        <Card aria-labelledby="stats-title">
          <h2 id="stats-title" className="font-display text-heading">
            Key stats
          </h2>
          <dl className="grid grid-cols-2 gap-3" data-testid="key-stats">
            {(
              [
                ...(stats
                  ? [
                      [
                        'Market cap',
                        stats.marketCap !== null && compact(stats.marketCap, h.currency),
                      ],
                      ['Fund size', stats.fundSize !== null && compact(stats.fundSize, h.currency)],
                      ['P/E', stats.pe !== null && stats.pe.toFixed(1)],
                      ['Forward P/E', stats.forwardPe !== null && stats.forwardPe.toFixed(1)],
                      ['EPS', stats.eps !== null && priceText(String(stats.eps), h.currency)],
                      ['Revenue', stats.revenue !== null && compact(stats.revenue)],
                      ['Net income', stats.netIncome !== null && compact(stats.netIncome)],
                      [
                        'Profit margin',
                        stats.profitMargin !== null && ratioText(stats.profitMargin, 1),
                      ],
                      [
                        'Dividend yield',
                        stats.dividendYield !== null && ratioText(stats.dividendYield),
                      ],
                      [
                        '52-week range',
                        stats.low52 !== null &&
                          stats.high52 !== null &&
                          `${priceText(String(stats.low52), h.currency)} – ${priceText(String(stats.high52), h.currency)}`,
                      ],
                      ['Beta', stats.beta !== null && stats.beta.toFixed(2)],
                      [
                        'Return this year',
                        stats.ytdReturn !== null && percentText(stats.ytdReturn),
                      ],
                      [
                        '5-year average return',
                        stats.fiveYearReturn !== null && percentText(stats.fiveYearReturn),
                      ],
                      ['Sector', stats.sector],
                      ['Industry', stats.industry],
                      ['Category', stats.category],
                      ['Fund manager', stats.family],
                    ]
                  : []),
                ...(local
                  ? [
                      ['Classification', local.classification.join(' · ')],
                      ['Fund type', local.types.join(', ')],
                      [
                        'Share exposure',
                        local.shareExposure ?? (local.exposure && `Profile ${local.exposure}`),
                      ],
                      ['Foreign currency exposure', local.currencyExposure],
                      ['Invests in', local.underlying.join(', ')],
                      ['ISIN', local.isin],
                    ]
                  : []),
              ] as [string, string | false | null][]
            )
              .filter((row): row is [string, string] => !!row[1])
              .map(([label, value]) => (
                <Fact key={label} label={label}>
                  {value}
                </Fact>
              ))}
          </dl>
          <p className="text-caption text-ink-muted">
            {stats && 'From the quote source, updated daily. Only the symbol is sent. '}
            {local && 'Fund details from the local exchange’s fund list, updated daily.'}
          </p>
        </Card>
      )}

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
                      : 'text-ink-muted hover:bg-surface-2 active:bg-surface-2',
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
            <Fact label="Yearly fee">
              {facts?.fee
                ? `${facts.fee}%`
                : stats?.expenseRatio != null
                  ? ratioText(stats.expenseRatio)
                  : '–'}
            </Fact>
            <Fact label="Type">
              {history?.type ? (TYPE_LABEL[history.type] ?? history.type) : '–'}
            </Fact>
            <Fact label="Index it tracks">{facts?.index ?? '–'}</Fact>
            <Fact label="Domicile">{facts?.domicile ?? stats?.country ?? '–'}</Fact>
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
            The fee and domicile come from the quote source when it knows the fund. What you type
            here wins. Links open on the fund manager’s site; nothing about you is sent.
          </p>
        </Card>
      )}
    </AppShell>
  )
}
