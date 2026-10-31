import { Card } from '@hearthside/ui'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AddPasskeyButton } from '@/components/AddPasskeyButton'
import { AuthShell } from '@/components/AuthShell'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Add a passkey · Hearthside' }
export const dynamic = 'force-dynamic'

export default async function RecoveredPage() {
  const { session, member } = await requireSession({ allowRecovery: true, allowPending: true })
  if (!session.viaRecovery) redirect('/')
  return (
    <AuthShell
      title={`Welcome back, ${member.name}`}
      lead="Add a passkey on this device to finish signing in."
    >
      <Card>
        <AddPasskeyButton variant="primary" after="/settings" />
      </Card>
    </AuthShell>
  )
}
