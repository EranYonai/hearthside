import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { requireDb } from '@/lib/db'
import { getHousehold } from '@/server/repo'
import { SetupForm } from './SetupForm'

export const metadata: Metadata = { title: 'Set up · Hearthside' }
export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  if (await getHousehold(requireDb())) redirect('/login')
  return (
    <AuthShell
      title="Welcome to Hearthside"
      lead="Set up your home. You can invite others later, or keep it just for you."
    >
      <SetupForm />
    </AuthShell>
  )
}
