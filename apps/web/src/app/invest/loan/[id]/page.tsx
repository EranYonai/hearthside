import {
  addMonths,
  formatMoney,
  HOLDING_CURRENCIES,
  loanKindLabel,
  parseRate,
} from '@hearthside/core'
import { Amount, buttonClasses, Card, Label, Notice } from '@hearthside/ui'
import { ChevronLeft, HandCoins } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import {
  exampleCandidates,
  holderOf,
  listProperties,
  loanDetail,
  mayManage,
  today,
} from '@/server/loans'
import { AuthError, listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { DeleteEstateButton, ExamplePicker, LoanBalanceForm, LoanForm } from '../../estate'

export const metadata: Metadata = { title: 'Loan · Hearthside' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const fmtDay = (on: string) => dateFormat.format(new Date(`${on}T00:00:00Z`))

/** "12 years 4 months", "8 months". */
function duration(months: number): string {
  const y = Math.floor(months / 12)
  const m = months % 12
  return (
    [
      y ? `${y} ${y === 1 ? 'year' : 'years'}` : null,
      m ? `${m} ${m === 1 ? 'month' : 'months'}` : null,
    ]
      .filter(Boolean)
      .join(' ') || 'Paid off'
  )
}

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { id } = await params
  const detail = await loanDetail(db, member, id).catch((err: unknown) => {
    if (err instanceof AuthError) notFound()
    throw err
  })
  const { loan, balanceMinor, paymentMinor, monthsLeft, paidPercent, payments, property } = detail
  const manage = mayManage(member, loan)
  const [people, candidates, props] = await Promise.all([
    listMembers(db, household.id),
    manage ? exampleCandidates(db, member, 'out', paymentMinor) : [],
    manage ? listProperties(db, member) : [],
  ])
  const holder = people.find((p) => p.id === holderOf(loan))
  const c = loan.currency
  const now = today(new Date())
  const yearAgo = addMonths(now, -12)
  const year = payments.filter((p) => p.on > yearAgo)
  const interestYear = year.reduce((n, p) => n + p.interestMinor, 0)
  const principalYear = year.reduce((n, p) => n + p.principalMinor, 0)

  return (
    <AppShell household={household.name} current="/invest">
      <Link href="/invest" className={`${buttonClasses('ghost')} justify-self-start`}>
        <ChevronLeft aria-hidden />
        Investments
      </Link>
      <div className="grid gap-1">
        <h1 className="flex items-center gap-2 font-display text-title">
          <span className="grid size-10 place-items-center rounded-pill bg-surface-2 text-ink-muted">
            <HandCoins size={20} aria-hidden />
          </span>
          {loan.name}
        </h1>
        <p className="text-caption text-ink-muted">
          {[
            holder ? (holder.id === member.id ? 'Yours' : holder.name) : 'Former member',
            loanKindLabel(loan.kind),
            loan.lender,
            c,
            loan.visibility === 'private' ? 'Private' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card aria-labelledby="balance-title">
        <Label id="balance-title">Still owed</Label>
        <div data-testid="loan-balance">
          <Amount minor={balanceMinor} currency={c} whole hero />
        </div>
        <div
          className="h-2 overflow-hidden rounded-pill bg-surface-2"
          role="meter"
          aria-label="Paid back"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={paidPercent}
        >
          <span
            className="block h-full rounded-pill bg-positive"
            style={{ width: `${paidPercent}%` }}
          />
        </div>
        <p className="text-caption text-ink-muted">
          {paidPercent}% of {formatMoney(loan.principalMinor, { currency: c, whole: true })} paid
          back
          {loan.balanceOn
            ? ` · from the lender’s balance on ${fmtDay(loan.balanceOn)}`
            : ' · following the schedule'}
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Monthly payment" testId="loan-payment">
            <Amount minor={paymentMinor} currency={c} whole className="font-display text-heading" />
          </Stat>
          <Stat label="Time left">
            <span className="font-display text-heading">
              {monthsLeft === null ? 'Not shrinking' : duration(monthsLeft)}
            </span>
          </Stat>
          <Stat label="Rate">
            <span className="font-display text-heading">{parseRate(loan.rate) ?? 0}%</span>
          </Stat>
          <Stat label="Started">
            <span className="font-display text-heading">{fmtDay(loan.startOn)}</span>
          </Stat>
        </dl>
        {property && (
          <p className="text-caption text-ink-muted">
            Secured on{' '}
            <Link href={`/invest/property/${property.id}`} className="text-brand-ink underline">
              {property.name}
            </Link>
            .
          </p>
        )}
      </Card>

      <Card aria-labelledby="payments-title">
        <h2 id="payments-title" className="font-display text-heading">
          Payments
        </h2>
        {payments.length > 0 ? (
          <>
            <p className="text-caption text-ink-muted" data-testid="loan-year-split">
              Last 12 months: {formatMoney(interestYear, { currency: c, whole: true })} interest,{' '}
              {formatMoney(principalYear, { currency: c, whole: true })} paid off the loan. The full
              payment counts as spending under Loans.
            </p>
            <ul data-testid="loan-payments">
              {payments.slice(0, 24).map((p) => (
                <li
                  key={p.id}
                  className="flex min-h-12 items-center gap-3 border-t border-line first:border-t-0"
                >
                  <span className="grid flex-1">
                    <span className="truncate">{p.description}</span>
                    <span className="text-caption text-ink-muted">
                      {fmtDay(p.on)} · {formatMoney(p.interestMinor, { currency: c })} interest ·{' '}
                      {formatMoney(p.principalMinor, { currency: c })} principal
                    </span>
                  </span>
                  <Amount minor={-p.paidMinor} currency={c} signed className="text-body-strong" />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-ink-muted">
            {loan.paymentKey
              ? 'No payments found yet with the description you picked.'
              : 'Pick the loan payment from your bank and every month’s payment is tied here, split into interest and principal.'}
          </p>
        )}
        {manage && (
          <details open={!loan.paymentKey}>
            <summary className="cursor-pointer text-body-strong text-brand-ink">
              {loan.paymentKey
                ? 'Change which payment is this loan'
                : 'Find the payment in the bank'}
            </summary>
            <div className="pt-3">
              <ExamplePicker
                target="loan"
                id={loan.id}
                candidates={candidates}
                tied={!!loan.paymentKey}
              />
            </div>
          </details>
        )}
      </Card>

      {manage ? (
        <>
          <Card aria-labelledby="correct-title">
            <details>
              <summary
                id="correct-title"
                className="cursor-pointer text-body-strong text-brand-ink"
              >
                Correct the balance
              </summary>
              <div className="pt-3">
                <LoanBalanceForm
                  id={loan.id}
                  minor={loan.balanceMinor}
                  on={loan.balanceOn}
                  today={now}
                />
              </div>
            </details>
          </Card>
          <Card aria-labelledby="edit-title">
            <details>
              <summary id="edit-title" className="cursor-pointer text-body-strong text-brand-ink">
                Loan details
              </summary>
              <div className="grid gap-6 pt-3">
                <LoanForm
                  loan={{
                    id: loan.id,
                    name: loan.name,
                    kind: loan.kind,
                    lender: loan.lender,
                    currency: loan.currency,
                    principalMinor: loan.principalMinor,
                    rate: loan.rate,
                    termMonths: loan.termMonths,
                    startOn: loan.startOn,
                    paymentMinor: loan.paymentMinor,
                    propertyId: loan.propertyId,
                    visibility: loan.visibility,
                    holderId: holderOf(loan),
                  }}
                  properties={props.map((p) => ({ id: p.id, name: p.name }))}
                  people={people
                    .filter((p) => p.role !== 'viewer' || p.id === holderOf(loan))
                    .map((p) => ({
                      id: p.id,
                      name: p.id === member.id ? `${p.name} (you)` : p.name,
                    }))}
                  selfId={member.id}
                  defaultCurrency={HOLDING_CURRENCIES.includes(c as never) ? c : 'ILS'}
                  today={now}
                />
                <DeleteEstateButton target="loan" id={loan.id} />
              </div>
            </details>
          </Card>
        </>
      ) : (
        <Notice tone="info">Only the person this loan belongs to can change it.</Notice>
      )}
    </AppShell>
  )
}

function Stat(props: { label: string; testId?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-md bg-surface-2 p-3" data-testid={props.testId}>
      <dt className="text-caption text-ink-muted">{props.label}</dt>
      <dd className="grid gap-0.5">{props.children}</dd>
    </div>
  )
}
