import { isTrendRange, TREND_RANGES } from '@hearthside/core'
import { Amount, buttonClasses, Card, cx, Label } from '@hearthside/ui'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { currentRates } from '@/server/fx'
import { trends } from '@/server/trends'
import { requireSession } from '@/server/session'
import { ValueChart } from '@/components/ValueChart'

export const metadata: Metadata = { title: 'Trends · Hearthside' }
export const dynamic = 'force-dynamic'

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function percent(rate: number | null): string {
  if (rate === null) return '–'
  const p = rate * 100
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const params = await searchParams
  const range = isTrendRange(params.range) ? params.range : '1y'
  const { rates } = await currentRates(db)
  const t = await trends(db, member, range, rates)
  const last = t.series.at(-1)
  const gain = last ? last.valueMinor - last.contributedMinor : 0

  return (
    <AppShell household={household.name} current="/invest">
      <Link href="/invest" className={`${buttonClasses('ghost')} justify-self-start`}>
        <ChevronLeft aria-hidden />
        Investments
      </Link>
      <h1 className="font-display text-title">Trends</h1>

      <nav aria-label="Range" className="flex gap-1 overflow-x-auto">
        {TREND_RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/invest/trends?range=${r.key}`}
            aria-current={r.key === range ? 'page' : undefined}
            className={cx(
              'grid min-h-11 min-w-11 place-items-center rounded-pill px-3 text-caption font-semibold',
              r.key === range ? 'bg-brand text-on-brand' : 'text-ink-muted hover:bg-surface-2',
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <Card aria-labelledby="trend-title">
        <div className="grid grid-cols-3 gap-3">
          <div className="grid gap-0.5">
            <Label id="trend-title">Value</Label>
            <Amount minor={last?.valueMinor ?? 0} currency={t.currency} whole />
          </div>
          <div className="grid gap-0.5">
            <Label>Put in</Label>
            <Amount minor={last?.contributedMinor ?? 0} currency={t.currency} whole />
          </div>
          <div className="grid gap-0.5">
            <Label>Return</Label>
            <span className="font-display text-amount tabular-nums" data-testid="range-return">
              {percent(t.rangeReturn)}
            </span>
          </div>
        </div>
        {t.series.length >= 2 ? (
          <ValueChart trend={t} />
        ) : (
          <p className="text-ink-muted" data-testid="trend-empty">
            {t.since
              ? `Values are recorded once a day, starting ${dayFormat.format(new Date(`${t.since}T00:00:00Z`))}. The chart fills in from tomorrow.`
              : t.missingRates.length > 0
                ? 'Nothing to chart in this currency yet.'
                : 'Add an investment account and its holdings, and values are recorded from today.'}
          </p>
        )}
        {last && last.contributedMinor !== 0 && (
          <p className="text-caption text-ink-muted">
            <Amount minor={Math.abs(gain)} currency={t.currency} whole className="text-caption" />{' '}
            {gain >= 0 ? 'more' : 'less'} than you put in. Return counts growth only, not new money,
            so it’s fair across deposits.
          </p>
        )}
        {t.estimatedUntil && t.series.length >= 2 && t.series[0]!.on < t.estimatedUntil && (
          <p className="text-caption text-ink-muted" data-testid="trend-estimated">
            Before {dayFormat.format(new Date(`${t.estimatedUntil}T00:00:00Z`))} the line is
            estimated from what you hold today and past prices, so trades and deposits before then
            aren’t reflected.
          </p>
        )}
        {t.missingRates.length > 0 && (
          <p className="text-caption text-ink-muted">
            Accounts in {t.missingRates.join(', ')} are left out until there’s an exchange rate.
          </p>
        )}
        {t.series.length >= 2 && (
          <details>
            <summary className="cursor-pointer text-caption text-brand-ink">
              Show as a table
            </summary>
            <table className="mt-2 w-full text-caption tabular-nums">
              <thead className="text-ink-muted">
                <tr>
                  <th className="text-start font-normal">Day</th>
                  <th className="text-end font-normal">Value</th>
                  <th className="text-end font-normal">Put in</th>
                </tr>
              </thead>
              <tbody>
                {[...t.series].reverse().map((p) => (
                  <tr key={p.on} className="border-t border-line">
                    <td className="py-1">{p.on}</td>
                    <td className="text-end">
                      <Amount
                        minor={p.valueMinor}
                        currency={t.currency}
                        whole
                        className="text-caption"
                      />
                    </td>
                    <td className="text-end">
                      <Amount
                        minor={p.contributedMinor}
                        currency={t.currency}
                        whole
                        className="text-caption"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Card>

      {t.years.length > 0 && (
        <Card aria-labelledby="years-title">
          <h2 id="years-title" className="font-display text-heading">
            By year
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-caption tabular-nums" data-testid="years">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-1 text-start font-normal">Year</th>
                  <th className="text-end font-normal">Return</th>
                  <th className="text-end font-normal">Put in</th>
                  <th className="text-end font-normal">Taken out</th>
                  <th className="text-end font-normal">Fees</th>
                  <th className="text-end font-normal">Income</th>
                </tr>
              </thead>
              <tbody>
                {t.years.map((y) => (
                  <tr key={y.year} className="border-t border-line">
                    <td className="py-2 font-semibold">{y.year}</td>
                    <td className="text-end">{percent(y.returnRate)}</td>
                    {[y.deposits, y.withdrawals, y.fees, y.income].map((v, i) => (
                      <td key={i} className="text-end">
                        <Amount minor={v} currency={t.currency} whole className="text-caption" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-caption text-ink-muted">
            Returns are time-weighted: deposits and withdrawals don’t count as gains or losses.
            Values in other currencies use today’s exchange rate.
          </p>
        </Card>
      )}
    </AppShell>
  )
}
