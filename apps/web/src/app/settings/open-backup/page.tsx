import { Card } from '@hearthside/ui'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { getBackupKey } from '@/server/backups'
import { requireSession } from '@/server/session'
import { OpenBackup } from './client'

export const metadata: Metadata = { title: 'Open a backup · Hearthside' }
export const dynamic = 'force-dynamic'

export default async function OpenBackupPage() {
  const { member, household } = await requireSession()
  if (member.role !== 'owner') redirect('/settings')
  const key = await getBackupKey(requireDb(), household.id)
  return (
    <AppShell household={household.name} current="/settings">
      <h1 className="font-display text-title">Open a backup</h1>
      <Card>
        {key ? (
          <OpenBackup credentialId={key.credentialId} />
        ) : (
          <p>Link your passkey in Settings → Backups first.</p>
        )}
      </Card>
    </AppShell>
  )
}
