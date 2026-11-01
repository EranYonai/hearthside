import { formatMoney, HOLDING_CURRENCIES, loanKindLabel } from '@hearthside/core'
import { Amount, buttonClasses, Card, Label, Notice } from '@hearthside/ui'
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { exampleCandidates, holderOf, mayManage, propertyDetail, today } from '@/server/loans'
import { AuthError, listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { DeleteEstateButton, ExamplePicker, PropertyForm } from '../../estate'

export const metadata: Metadata = { title: 'Property · Hearthside' }
export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const fmtDay = (on: string) => dateFormat.format(new Date(`${on}T00:00:00Z`))

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { id } = await params
  const detail = await propertyDetail(db, member, id).catch((err: unknown) => {
    if (err instanceof AuthError) notFound()
    throw err
  })
  const { property, rent, rents, loans, equityMinor } = detail
  const manage = mayManage(member, property)
  const [people, candidates] = await Promise.all([
    listMembers(db, household.id),
    manage ? exampleCandidates(db, member, 'in', property.rentMinor) : [],
  ])
  const holder = people.find((p) => p.id === holderOf(property))
  const c = property.currency
  const now = today(new Date())
  const gain = property.purchaseMinor !== null ? property.valueMinor - property.purchaseMinor : null

  return (
    <AppShell household={household.name} current="/invest">
      <Link href="/invest" className={`${buttonClasses('ghost')} justify-self-start`}>
        <ChevronLeft aria-hidden />
        Investments
      </Link>
      <div className="grid gap-1">
        <h1 className="flex items-center gap-2 font-display text-title">
          <span className="grid size-10 place-items-center rounded-pill bg-surface-2 text-ink-muted">
            <Building2 size={20} aria-hidden />
          </span>
          {property.name}
        </h1>
        <p className="text-caption text-ink-muted">
          {[
            holder ? (holder.id === member.id ? 'Yours' : holder.name) : 'Former member',
            'Property',
            c,
            property.visibility === 'private' ? 'Private' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Card aria-labelledby="value-title">
        <Label id="value-title">Worth</Label>
        <div data-testid="property-value">
          <Amount minor={property.valueMinor} currency={c} whole hero />
        </div>
        <p className="text-caption text-ink-muted">
          As of {fmtDay(property.valueOn)}
          {gain !== null &&
            property.purchasedOn &&
            ` · ${formatMoney(gain, { currency: c, whole: true, signed: true })} since you bought it on ${fmtDay(property.purchasedOn)}`}
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Yours after loans" testId="property-equity">
            <Amount minor={equityMinor} currency={c} whole className="font-display text-heading" />
          </Stat>
          <Stat label="Rent a month" testId="property-rent">
            {rent.monthlyMinor > 0 ? (
              <Amount
                minor={rent.monthlyMinor}
                currency={c}
                whole
                className="font-display text-heading"
              />
            ) : (
              <span className="font-display text-heading text-ink-faint">—</span>
            )}
            {rent.yieldPercent !== null && (
              <span className="text-caption text-ink-muted">
                {rent.yieldPercent.toFixed(1)}% a year of its value
              </span>
            )}
          </Stat>
        </dl>
      </Card>

      {loans.length > 0 && (
        <Card aria-labelledby="loans-title" className="gap-0">
          <h2 id="loans-title" className="pb-2 font-display text-heading">
            Loans on it
          </h2>
          <ul>
            {loans.map((l) => (
              <li key={l.loan.id} className="border-t border-line first:border-t-0">
                <Link
                  href={`/invest/loan/${l.loan.id}`}
                  className="flex min-h-12 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="grid flex-1">
                    <span className="text-body-strong">{l.loan.name}</span>
                    <span className="text-caption text-ink-muted">
                      {loanKindLabel(l.loan.kind)} · {l.paidPercent}% paid back
                    </span>
                  </span>
                  <Amount
                    minor={-l.balanceMinor}
                    currency={l.loan.currency}
                    whole
                    className="text-body-strong"
                  />
                  <ChevronRight size={18} aria-hidden className="text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-labelledby="rent-title">
        <h2 id="rent-title" className="font-display text-heading">
          Rent
        </h2>
        {rents.length > 0 ? (
          <>
            <p className="text-caption text-ink-muted">
              {formatMoney(rent.yearMinor, { currency: c, whole: true })} in the last 12 months.
              Rent still counts as income in your monthly totals.
            </p>
            <ul data-testid="rent-rows">
              {rents.slice(0, 12).map((r) => (
                <li
                  key={r.id}
                  className="flex min-h-10 items-center gap-3 border-t border-line first:border-t-0"
                >
                  <span className="grid flex-1">
                    <span className="truncate">{r.description}</span>
                    <span className="text-caption text-ink-muted">{fmtDay(r.on)}</span>
                  </span>
                  <Amount minor={r.minor} currency={c} signed className="text-body-strong" />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-ink-muted">
            {property.rentKey
              ? 'No rent found yet with the description you picked.'
              : 'If it’s rented out, pick the rent deposit from your bank and every month’s rent is tied here.'}
          </p>
        )}
        {manage && (
          <details open={!property.rentKey}>
            <summary className="cursor-pointer text-body-strong text-brand-ink">
              {property.rentKey ? 'Change which deposit is the rent' : 'Find the rent in the bank'}
            </summary>
            <div className="pt-3">
              <ExamplePicker
                target="rent"
                id={property.id}
                candidates={candidates}
                tied={!!property.rentKey}
              />
            </div>
          </details>
        )}
      </Card>

      {manage ? (
        <Card aria-labelledby="edit-title">
          <details>
            <summary id="edit-title" className="cursor-pointer text-body-strong text-brand-ink">
              Property details
            </summary>
            <div className="grid gap-6 pt-3">
              <PropertyForm
                property={{
                  id: property.id,
                  name: property.name,
                  currency: property.currency,
                  valueMinor: property.valueMinor,
                  valueOn: property.valueOn,
                  purchaseMinor: property.purchaseMinor,
                  purchasedOn: property.purchasedOn,
                  rentMinor: property.rentMinor,
                  visibility: property.visibility,
                  holderId: holderOf(property),
                }}
                people={people
                  .filter((p) => p.role !== 'viewer' || p.id === holderOf(property))
                  .map((p) => ({
                    id: p.id,
                    name: p.id === member.id ? `${p.name} (you)` : p.name,
                  }))}
                selfId={member.id}
                defaultCurrency={HOLDING_CURRENCIES.includes(c as never) ? c : 'ILS'}
                today={now}
              />
              <DeleteEstateButton target="property" id={property.id} />
            </div>
          </details>
        </Card>
      ) : (
        <Notice tone="info">Only the person this property belongs to can change it.</Notice>
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
