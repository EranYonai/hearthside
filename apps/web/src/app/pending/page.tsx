import { Card } from '@hearthside/ui'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { SignOutButton } from '@/components/SignOutButton'
import { isApproved } from '@/server/repo'
import { requireSession } from '@/server/session'
import { CheckAgain } from './client'

export const metadata: Metadata = { title: 'Waiting for approval · Hearthside' }
export const dynamic = 'force-dynamic'

/**
 * Where someone lands after joining by invite, until the owner approves them.
 * It shows only their own name: no household name, members or data.
 */
export default async function PendingPage() {
  const { member } = await requireSession({ allowPending: true })
  if (isApproved(member)) redirect('/')
  return (
    <AuthShell
      title={`Almost there, ${member.name}`}
      lead="Ask your household owner to approve you. They can do it in Settings, under Members."
    >
      <Card>
        <p className="text-body-strong" data-testid="pending-status">
          Pending approval
        </p>
        <p className="text-ink-muted">
          You’ll see the household as soon as you’re approved. This page checks again on its own.
        </p>
        <div className="flex flex-wrap gap-2">
          <CheckAgain />
          <SignOutButton />
        </div>
      </Card>
    </AuthShell>
  )
}
