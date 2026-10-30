import { Card, Label, buttonClasses } from '@hearthside/ui'
import { UserPlus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { getHousehold, listMembers } from '@/server/repo'
import { currentSession, requireSession } from '@/server/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (!(await currentSession()) && !(await getHousehold(requireDb()))) redirect('/setup')
  const { member, household } = await requireSession()
  const people = await listMembers(requireDb(), household.id)
  const solo = people.length === 1
  return (
    <AppShell household={household.name} current="/">
      <h1 className="font-display text-title">Hi {member.name}</h1>
      <Card>
        <Label>{solo ? 'Your home' : 'Our home'}</Label>
        <p>
          {solo
            ? 'You’re all set up. Your overview arrives here once your data is in.'
            : `${people.map((p) => p.name).join(', ')} share this home. Your overview arrives here once your data is in.`}
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
