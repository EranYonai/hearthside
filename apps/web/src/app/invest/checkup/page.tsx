import { Amount, buttonClasses, Card, cx } from '@hearthside/ui'
import { ChevronLeft, CircleCheck, Info, Lightbulb } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { runCheckup } from '@/server/checkup'
import { currentRates } from '@/server/fx'
import { canEdit } from '@/server/ledger'
import { requireSession } from '@/server/session'
import { InvestSettingsForm } from '../client'

export const metadata: Metadata = { title: 'Check-up · Hearthside' }
export const dynamic = 'force-dynamic'

const LOOK = {
  ok: { icon: CircleCheck, label: 'On track', tone: 'text-positive' },
  nudge: { icon: Lightbulb, label: 'Worth a look', tone: 'text-warning' },
  info: { icon: Info, label: 'Good to know', tone: 'text-info' },
} as const

export default async function CheckupPage() {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { rates } = await currentRates(db)
  const { settings, currency, items } = await runCheckup(db, member, rates)
  const nudges = items.filter((i) => i.status === 'nudge').length

  return (
    <AppShell household={household.name} current="/invest">
      <Link href="/invest" className={`${buttonClasses('ghost')} justify-self-start`}>
        <ChevronLeft aria-hidden />
        Investments
      </Link>
      <div className="grid gap-1">
        <h1 className="font-display text-title">Check-up</h1>
        <p className="text-caption text-ink-muted">
          A few gentle checks in the spirit of passive index investing. General education, not
          financial advice; nothing here is a buy or sell order.
        </p>
      </div>

      {settings.checkupOn ? (
        <Card aria-labelledby="checkup-title">
          <h2 id="checkup-title" className="font-display text-heading">
            {nudges === 0
              ? 'Nothing needs a look'
              : nudges === 1
                ? '1 thing worth a look'
                : `${nudges} things worth a look`}
          </h2>
          <ul className="grid divide-y divide-line" data-testid="checkup">
            {items.map((item) => {
              const look = LOOK[item.status]
              const Icon = look.icon
              return (
                <li key={item.key} className="flex gap-3 py-3" data-status={item.status}>
                  <Icon
                    size={20}
                    className={cx('mt-0.5 flex-none', look.tone)}
                    aria-label={look.label}
                  />
                  <span className="grid gap-0.5">
                    <span className="text-body-strong">{item.title}</span>
                    <span className="text-caption text-ink-muted">{item.detail}</span>
                    {item.key === 'emergency' && item.numbers?.goal !== undefined && (
                      <span className="text-caption text-ink-muted">
                        About{' '}
                        <Amount
                          minor={item.numbers.goal}
                          currency={currency}
                          whole
                          className="text-caption"
                        />{' '}
                        for {settings.emergencyMonths} months.
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className="text-ink-muted">The check-up is off. Turn it back on below.</p>
        </Card>
      )}

      <Card aria-labelledby="settings-title">
        <h2 id="settings-title" className="font-display text-heading">
          Your plan
        </h2>
        {canEdit(member) ? (
          <InvestSettingsForm settings={settings} />
        ) : (
          <p className="text-ink-muted">
            {settings.stocksTarget}% stocks / {100 - settings.stocksTarget}% bonds and cash, with{' '}
            {settings.emergencyMonths} months of spending set aside.
          </p>
        )}
        <p className="text-caption text-ink-muted">
          The split is the household’s; 80/20 is a common starting point for long horizons, and many
          people lower the stocks share as they near the time they need the money.
        </p>
      </Card>
    </AppShell>
  )
}
