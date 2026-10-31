import { Card, Label, Notice, SummaryCard, buttonClasses } from '@hearthside/ui'
import { FileUp, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { householdCategorySet } from '@/server/categories'
import { canEdit, listMonths, totals } from '@/server/ledger'
import { getHousehold, isApproved, listMembers } from '@/server/repo'
import { currentSession, requireSession } from '@/server/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (!(await currentSession()) && !(await getHousehold(requireDb()))) redirect('/setup')
  const { member, household } = await requireSession()
  if (!member.onboardedAt) redirect('/welcome')
  const db = requireDb()
  const isOwner = member.role === 'owner'
  const [everyone, months] = await Promise.all([
    listMembers(db, household.id, { includePending: isOwner }),
    listMonths(db, member),
  ])
  const people = everyone.filter(isApproved)
  const waiting = everyone.length - people.length
  const solo = people.length === 1
  const latest = months[0]
  const [sum, categories] = await Promise.all([
    latest ? totals(db, member, { month: latest }) : undefined,
    householdCategorySet(db, member.householdId),
  ])
  const spent = sum ? Math.abs(sum.spent) : 0
  const monthLabel = latest
    ? new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${latest}-01`),
      )
    : ''
  return (
    <AppShell household={household.name} current="/">
      <h1 className="font-display text-title">Hi {member.name}</h1>
      {waiting > 0 && (
        <Notice tone="warning">
          {waiting === 1 ? 'Someone is' : `${waiting} people are`} waiting for your approval.{' '}
          <Link href="/settings#members" className="underline">
            Review in Settings
          </Link>
        </Notice>
      )}
      {sum ? (
        <>
          <SummaryCard
            label={`Spent in ${monthLabel}`}
            minor={-spent}
            segments={sum.byCategory.map((c) => ({
              name: categories.label(c.category),
              minor: Math.abs(c.minor),
              percent: spent ? (Math.abs(c.minor) / spent) * 100 : 0,
            }))}
          />
          <Link
            href={`/transactions?month=${latest}`}
            className={`${buttonClasses('secondary')} -mt-3 justify-self-start`}
          >
            See {sum.count} transactions
          </Link>
        </>
      ) : (
        canEdit(member) && (
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
      <Card>
        <Label>{solo ? 'Your home' : 'Our home'}</Label>
        <p>
          {solo ? 'Just you for now.' : `${people.map((p) => p.name).join(', ')} share this home.`}
        </p>
        {member.role === 'owner' && (
          <Link
            href="/settings#members"
            className={`${buttonClasses('secondary')} justify-self-start`}
          >
            <UserPlus aria-hidden />
            {solo ? 'Invite someone' : 'Manage members'}
          </Link>
        )}
      </Card>
    </AppShell>
  )
}
