import { formatMoney, WEALTH_RANGES } from '@hearthside/core'
import { buttonClasses, Card, Label } from '@hearthside/ui'
import { Building2, ChevronRight, FileUp, HandCoins, Landmark, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { PrivateAmount } from './PrivateAmount'
import type { Wealth } from '@/server/wealth'
import { AccountMark } from './AccountCard'
import { WealthSlab } from './WealthSlab'

const KIND_LABEL = {
  cash: 'Bank',
  invest: 'Investments',
  property: 'Property',
  loan: 'Loan',
} as const

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Neutral stand-ins for accounts with no color of their own. */
const FALLBACK = ['var(--hs-chart-1)', 'var(--hs-chart-2)', 'var(--hs-chart-3)']

/**
 * The household's net worth: bank balances, investments and property less loans, how it's split,
 * and how it moved over the chosen range.
 */
export function WealthCard({ wealth, editable }: { wealth: Wealth; editable: boolean }) {
  const { currency, totalMinor, cashMinor, investedMinor, propertyMinor, owedMinor, change } =
    wealth
  const span = WEALTH_RANGES.find((r) => r.key === wealth.range) ?? WEALTH_RANGES[0]
  const base = Math.max(cashMinor, 0) + Math.max(investedMinor, 0) + Math.max(propertyMinor, 0)
  if (!wealth.any)
    return (
      <Card aria-labelledby="wealth-title" className="wealth-glow">
        <Label id="wealth-title">What we own</Label>
        <p>
          Your bank balances and investments, added up into one number, with how it changes over
          time.
        </p>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Link href="/import" className={buttonClasses('primary')}>
              <FileUp aria-hidden />
              Import a bank statement
            </Link>
            <Link href="/invest" className={buttonClasses('secondary')}>
              <TrendingUp aria-hidden />
              Add investments
            </Link>
          </div>
        )}
      </Card>
    )

  const positive = wealth.parts.filter((p) => p.minor > 0)
  const shown = positive.reduce((n, p) => n + p.minor, 0)
  let neutral = 0
  const colored = positive.map((p) => ({
    ...p,
    paint: p.color ?? FALLBACK[neutral++ % FALLBACK.length]!,
  }))
  const up = change.minor >= 0

  return (
    <section aria-labelledby="wealth-title" className="grid gap-3" data-testid="wealth">
      <WealthSlab
        total={<PrivateAmount minor={totalMinor} currency={currency} whole hero />}
        under={
          owedMinor > 0 ? (
            <span data-testid="wealth-net">
              <PrivateAmount
                minor={wealth.ownMinor}
                currency={currency}
                whole
                className="text-caption"
              />{' '}
              owned, less{' '}
              <PrivateAmount minor={owedMinor} currency={currency} whole className="text-caption" />{' '}
              in loans
            </span>
          ) : undefined
        }
        change={
          wealth.series.length > 1 && change.minor !== 0
            ? {
                up,
                text: `${formatMoney(change.minor, { currency, whole: true, signed: true })}${
                  change.percent !== null
                    ? ` (${up ? '+' : '−'}${Math.abs(change.percent).toFixed(1)}%)`
                    : ''
                } · ${span.label}`,
              }
            : undefined
        }
        currency={currency}
        series={wealth.series.map((p) => ({ on: p.on, minor: p.totalMinor }))}
        ranges={WEALTH_RANGES.map((r) => ({
          key: r.key,
          label: r.label,
          href: r.key === '6m' ? '/' : `/?range=${r.key}`,
          current: r.key === wealth.range,
        }))}
      />

      <div className="grid grid-cols-2 gap-2 [&>:last-child:nth-child(odd)]:col-span-2">
        <Split
          icon={<Landmark size={16} aria-hidden />}
          label="Bank"
          minor={cashMinor}
          currency={currency}
          share={pct(Math.max(cashMinor, 0), base)}
          href="/accounts"
        />
        <Split
          icon={<TrendingUp size={16} aria-hidden />}
          label="Invested"
          minor={investedMinor}
          currency={currency}
          share={pct(Math.max(investedMinor, 0), base)}
          href="/invest"
        />
        {propertyMinor > 0 && (
          <Split
            icon={<Building2 size={16} aria-hidden />}
            label="Property"
            minor={propertyMinor}
            currency={currency}
            share={pct(propertyMinor, base)}
            href="/invest#estate-title"
          />
        )}
        {owedMinor > 0 && (
          <Split
            icon={<HandCoins size={16} aria-hidden />}
            label="Loans"
            minor={-owedMinor}
            currency={currency}
            href="/invest#estate-title"
          />
        )}
      </div>

      <Card className="gap-3">
        {colored.length > 0 && (
          <div className="grid gap-2">
            <div className="flex h-3 gap-1" aria-hidden data-testid="wealth-meter">
              {colored.map((p) => (
                <span
                  key={p.key}
                  title={p.name}
                  className="block h-full min-w-1.5 rounded-pill"
                  style={{ flex: `${p.minor} 1 0`, background: p.paint }}
                />
              ))}
            </div>
            <ul aria-label="What we own, by account" data-testid="wealth-accounts">
              {colored.map((p) => (
                <li key={p.key} className="border-t border-line first:border-t-0">
                  <Link
                    href={p.href}
                    className="flex min-h-12 items-center gap-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span
                      className="h-6 w-1 flex-none rounded-pill"
                      style={{ background: p.paint }}
                      aria-hidden
                    />
                    <AccountMark name={p.name} provider={p.provider} size="sm" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-body-strong">{p.name}</span>
                      <span className="text-caption text-ink-muted">
                        {KIND_LABEL[p.kind]} · {pct(p.minor, shown)}%
                      </span>
                    </span>
                    <PrivateAmount
                      minor={p.minor}
                      currency={currency}
                      whole
                      className="text-body-strong"
                    />
                    <ChevronRight size={18} aria-hidden className="text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {wealth.owed.length > 0 && (
          <ul aria-label="What we owe, by loan" data-testid="wealth-owed">
            {wealth.owed.map((p) => (
              <li key={p.key} className="border-t border-line first:border-t-0">
                <Link
                  href={p.href}
                  className="flex min-h-12 items-center gap-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="h-6 w-1 flex-none rounded-pill bg-negative" aria-hidden />
                  <span className="grid size-7 flex-none place-items-center rounded-pill bg-surface-2 text-ink-muted">
                    <HandCoins size={16} aria-hidden />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-body-strong">{p.name}</span>
                    <span className="text-caption text-ink-muted">
                      {['Loan', p.provider].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <PrivateAmount
                    minor={-p.minor}
                    currency={currency}
                    whole
                    className="text-body-strong"
                  />
                  <ChevronRight size={18} aria-hidden className="text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {wealth.missing.length > 0 && (
          <p className="text-caption text-ink-muted" data-testid="wealth-missing">
            Not counted yet, no balance:{' '}
            {wealth.missing.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ', '}
                <Link href={`/accounts/${m.id}`} className="text-brand-ink underline">
                  {m.name}
                </Link>
              </span>
            ))}
            .
          </p>
        )}
        {wealth.unconverted.length > 0 && (
          <p className="text-caption text-ink-muted">
            Amounts in {wealth.unconverted.join(', ')} are left out until there’s an exchange rate.
          </p>
        )}
      </Card>
    </section>
  )
}

function Split(props: {
  icon: React.ReactNode
  label: string
  minor: number
  currency: string
  /** Share of what's owned; left out for loans. */
  share?: number
  href: string
}) {
  return (
    <Link
      href={props.href}
      className="grid min-w-0 gap-0.5 rounded-lg border border-line bg-surface-1 px-3 py-2.5 shadow-card active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="flex items-center gap-1.5 text-caption text-ink-muted">
        {props.icon}
        {props.label}
        {props.share !== undefined && (
          <span className="ms-auto tabular-nums text-ink-faint">{props.share}%</span>
        )}
      </span>
      <PrivateAmount
        wrapClassName="font-display text-body-strong"
        minor={props.minor}
        currency={props.currency}
        whole
        className="font-display text-body-strong"
      />
    </Link>
  )
}
