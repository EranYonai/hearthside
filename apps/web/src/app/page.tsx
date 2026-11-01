import { accountLook, biggestMoves, daysSince, isWealthRange } from '@hearthside/core'
import {
  Card,
  CategoryIcon,
  Label,
  MonthBars,
  Notice,
  SummaryCard,
  buttonClasses,
  type Category,
} from '@hearthside/ui'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, FileUp, UserPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { PrivateAmount } from '@/components/PrivateAmount'
import { RecurringList } from '@/components/RecurringList'
import { WealthCard } from '@/components/WealthCard'
import { requireDb } from '@/lib/db'
import { householdCategorySet } from '@/server/categories'
import { currentRates } from '@/server/fx'
import {
  accountFreshness,
  canEdit,
  listAccounts,
  listMonths,
  monthlyFlows,
  totals,
} from '@/server/ledger'
import { keepQuotesFresh } from '@/server/prices'
import { listRecurring } from '@/server/recurring'
import { getHousehold, isApproved, listMembers } from '@/server/repo'
import { currentSession, requireSession } from '@/server/session'
import { wealth } from '@/server/wealth'

export const dynamic = 'force-dynamic'

const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  new Intl.DateTimeFormat('en-GB', { month: style, timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  )

/** The six months ending with `month`, oldest first. */
function lastMonths(month: string, count = 6): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}

const todayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const asked = (await searchParams).range
  const range = isWealthRange(asked) ? asked : '6m'
  if (!(await currentSession()) && !(await getHousehold(requireDb()))) redirect('/setup')
  const { member, household } = await requireSession()
  if (!member.onboardedAt) redirect('/welcome')
  const db = requireDb()
  const isOwner = member.role === 'owner'
  const [everyone, months, fx] = await Promise.all([
    listMembers(db, household.id, { includePending: isOwner }),
    listMonths(db, member),
    currentRates(db),
    keepQuotesFresh(db),
  ])
  const people = everyone.filter(isApproved)
  const waiting = everyone.length - people.length
  const solo = people.length === 1
  const latest = months[0]
  const trail = latest ? lastMonths(latest) : []
  const [sum, categories, accounts, owned, history, fresh, recurring] = await Promise.all([
    latest ? totals(db, member, { month: latest }) : undefined,
    householdCategorySet(db, member.householdId),
    listAccounts(db, member),
    wealth(db, member, fx.rates, new Date(), range),
    latest ? monthlyFlows(db, member, {}, trail) : [],
    accountFreshness(db, member),
    listRecurring(db, member),
  ])
  const moves = history.length > 1 ? biggestMoves(history.at(-1)!, history.at(-2)!) : []
  const before = trail.length > 1 ? await totals(db, member, { month: trail.at(-2)! }) : undefined
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const spent = sum ? Math.abs(sum.spent) : 0
  const editable = canEdit(member)
  const monthLabel = latest ? monthName(latest) : ''

  return (
    <AppShell household={household.name} current="/">
      <div className="grid gap-0.5">
        <h1 className="font-display text-title">Hi {member.name}</h1>
        <p className="text-caption text-ink-muted">{todayFormat.format(new Date())}</p>
      </div>
      {waiting > 0 && (
        <Notice tone="warning">
          {waiting === 1 ? 'Someone is' : `${waiting} people are`} waiting for your approval.{' '}
          <Link href="/settings#members" className="underline">
            Review in Settings
          </Link>
        </Notice>
      )}

      <WealthCard wealth={owned} editable={editable} />

      {sum ? (
        <>
          <div className="grid grid-cols-2 gap-3" data-testid="month-flow">
            <Flow
              icon={<ArrowDownLeft size={18} aria-hidden />}
              label={`In, ${monthLabel}`}
              minor={sum.received}
              previous={before?.received}
              upIsGood
            />
            <Flow
              icon={<ArrowUpRight size={18} aria-hidden />}
              label={`Out, ${monthLabel}`}
              minor={spent}
              previous={before ? Math.abs(before.spent) : undefined}
            />
          </div>
          <SummaryCard
            label={`Spent in ${monthLabel}`}
            minor={-spent}
            segments={sum.byCategory.map((c) => ({
              name: categories.label(c.category),
              minor: Math.abs(c.minor),
              percent: spent ? (Math.abs(c.minor) / spent) * 100 : 0,
            }))}
            groups={sum.byAccount.flatMap((g) => {
              const a = accountById.get(g.accountId)
              if (!a) return []
              return [
                {
                  key: a.id,
                  name: a.name,
                  color: accountLook(a).color,
                  minor: g.minor,
                  parts: g.byCategory.map((c) => ({
                    name: categories.label(c.category),
                    minor: c.minor,
                  })),
                },
              ]
            })}
          />
          <Link
            href={`/transactions?month=${latest}`}
            className={`${buttonClasses('secondary')} -mt-3 justify-self-start`}
          >
            See {sum.count} transactions
          </Link>
          {history.filter((h) => h.spent !== 0).length > 1 && (
            <Card aria-labelledby="months-title">
              <Label id="months-title">Spending, last 6 months</Label>
              <MonthBars
                label="Spending per month"
                months={history.map((h) => ({
                  month: h.month,
                  label: monthName(h.month, 'short'),
                  minor: h.spent,
                  href: `/transactions?month=${h.month}`,
                  current: h.month === latest,
                }))}
              />
            </Card>
          )}
          {moves.length > 0 && (
            <Card aria-labelledby="moves-title">
              <Label id="moves-title">What changed since {monthName(trail.at(-2)!)}</Label>
              <ul className="-mx-2 grid" data-testid="moves">
                {moves.map((m) => {
                  const slug = m.category || null
                  return (
                    <li key={m.category || 'none'}>
                      <Link
                        href={`/transactions?month=${latest}&category=${m.category || 'none'}`}
                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <CategoryIcon category={categories.icon(slug) as Category} />
                        <span className="truncate text-body-strong">{categories.label(slug)}</span>
                        <span className="flex items-center gap-1 text-caption text-ink-muted">
                          {m.change > 0 ? '▲' : '▼'}
                          <PrivateAmount
                            minor={Math.abs(m.change)}
                            whole
                            className="text-caption"
                          />
                          {m.change > 0 ? 'more' : 'less'}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </>
      ) : (
        editable && (
          <Card>
            <Label>Get started</Label>
            <p>Import a statement file to see where the money goes.</p>
            <Link href="/import" className={`${buttonClasses('primary')} justify-self-start`}>
              <FileUp aria-hidden />
              Import a statement
            </Link>
          </Card>
        )
      )}

      {recurring.length > 0 && (
        <Card aria-labelledby="fixed-title">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href="/recurring"
              className="flex items-center gap-0.5 rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Label id="fixed-title">Fixed costs</Label>
              <ChevronRight size={16} className="text-ink-muted" aria-hidden />
            </Link>
            <span className="flex items-baseline gap-1 text-caption text-ink-muted">
              <PrivateAmount
                minor={recurring.reduce((n, r) => n + r.monthlyMinor, 0)}
                whole
                className="text-body-strong"
              />
              a month
            </span>
          </div>
          <RecurringList
            items={recurring.slice(0, 3)}
            categories={categories}
            editable={editable}
          />
          {recurring.length > 3 && (
            <Link href="/recurring" className={`${buttonClasses('secondary')} justify-self-start`}>
              {recurring.length - 3} more
            </Link>
          )}
        </Card>
      )}
      {fresh.some((a) => a.newest) && (
        <Card aria-labelledby="fresh-title">
          <Label id="fresh-title">Up to date to</Label>
          <ul className="grid gap-2" data-testid="freshness">
            {fresh.map((a) => (
              <Fresh key={a.id} name={a.name} newest={a.newest} editable={editable} />
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 place-items-center rounded-pill bg-brand-soft text-brand-ink">
            <Users size={20} aria-hidden />
          </span>
          <span className="grid min-w-0 flex-1">
            <Label>{solo ? 'Your home' : 'Our home'}</Label>
            <span>
              {solo
                ? 'Just you for now.'
                : `${people.map((p) => p.name).join(', ')} share this home.`}
            </span>
          </span>
          {isOwner && (
            <Link href="/settings#members" className={buttonClasses('secondary')}>
              <UserPlus aria-hidden />
              {solo ? 'Invite someone' : 'Manage members'}
            </Link>
          )}
        </div>
      </Card>
    </AppShell>
  )
}

/** A month's money in or out, against the month before. */
function Flow(props: {
  icon: React.ReactNode
  label: string
  minor: number
  previous?: number
  /** Money in going up is good news; spending going up isn't. */
  upIsGood?: boolean
}) {
  const delta =
    props.previous !== undefined && props.previous > 0
      ? ((props.minor - props.previous) / props.previous) * 100
      : null
  const good = delta !== null && delta >= 0 === Boolean(props.upIsGood)
  return (
    <Card className="gap-1 p-3">
      <span className="flex items-center gap-1.5 text-caption text-ink-muted">
        {props.icon}
        {props.label}
      </span>
      <PrivateAmount
        wrapClassName="font-display text-heading"
        minor={props.minor}
        whole
        className="font-display text-heading"
      />
      {delta !== null && Math.round(delta) !== 0 && (
        <span className={`text-caption ${good ? 'text-positive' : 'text-ink-muted'}`}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}% vs last month
        </span>
      )}
    </Card>
  )
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** A month without new entries usually means a statement is waiting to be imported. */
const STALE_DAYS = 35

function Fresh({
  name,
  newest,
  editable,
}: {
  name: string
  newest: string | null
  editable: boolean
}) {
  const days = newest ? daysSince(newest) : null
  const stale = days === null || days > STALE_DAYS
  let note = 'No entries yet'
  if (newest) note = days === 0 ? 'Today' : dayFormat.format(new Date(`${newest}T00:00:00Z`))
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate">{name}</span>
      <span className="flex flex-none items-center gap-2 text-caption">
        <span className={stale ? 'text-warning' : 'text-ink-muted'} data-stale={stale || undefined}>
          {note}
        </span>
        {stale && editable && (
          <Link href="/import" className="text-brand-ink underline">
            Import
          </Link>
        )}
      </span>
    </li>
  )
}
