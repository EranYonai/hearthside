import { categoryLabel } from '@hearthside/core'
import { Card, Label, SummaryCard, buttonClasses } from '@hearthside/ui'
import { FileUp, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { canEdit, listMonths, totals } from '@/server/ledger'
import { getHousehold, listMembers } from '@/server/repo'
import { currentSession, requireSession } from '@/server/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (!(await currentSession()) && !(await getHousehold(requireDb()))) redirect('/setup')
  const { member, household } = await requireSession()
  const db = requireDb()
  const [people, months] = await Promise.all([
    listMembers(db, household.id),
    listMonths(db, member),
  ])
  const solo = people.length === 1
  const latest = months[0]
  const sum = latest ? await totals(db, member, { month: latest }) : undefined
  const spent = sum ? Math.abs(sum.spent) : 0
  const monthLabel = latest
    ? new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${latest}-01`),
      )
    : ''
  return (
    <AppShell household={household.name} current="/">
      <h1 className="font-display text-title">Hi {member.name}</h1>
      {sum ? (
        <>
          <SummaryCard
            label={`Spent in ${monthLabel}`}
            minor={-spent}
            segments={sum.byCategory.map((c) => ({
              name: categoryLabel(c.category),
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
