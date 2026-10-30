import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { requireDb } from '@/lib/db'
import { getHousehold } from '@/server/repo'
import { currentSession } from '@/server/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in · Hearthside' }
export const dynamic = 'force-dynamic'

// Deliberately generic: the sign-in page never names the home or its members.
export default async function LoginPage() {
  if (!(await getHousehold(requireDb()))) redirect('/setup')
  if (await currentSession()) redirect('/')
  return (
    <AuthShell title="Hearthside" lead="One home, one clear picture.">
      <LoginForm />
    </AuthShell>
  )
}
