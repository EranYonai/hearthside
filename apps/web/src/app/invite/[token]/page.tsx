import { Card } from '@hearthside/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/AuthShell'
import { requireDb } from '@/lib/db'
import { findOpenInvite } from '@/server/repo'
import { JoinForm } from './JoinForm'

export const metadata: Metadata = { title: 'Join · Hearthside', referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

const ROLE_TEXT = {
  adult: 'You’ll connect your own accounts and see what the home shares.',
  viewer: 'You’ll be able to see what the home shares.',
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const open = await findOpenInvite(requireDb(), token)
  if (!open) {
    return (
      <AuthShell
        title="This invite has expired"
        lead="Invite links work once and for 7 days. Ask for a new one."
      >
        <Card>
          <Link href="/login" className="justify-self-center text-body-strong text-brand-ink">
            Go to sign in
          </Link>
        </Card>
      </AuthShell>
    )
  }
  return (
    <AuthShell title={`Join ${open.household.name}`} lead={ROLE_TEXT[open.invite.role]}>
      <JoinForm token={token} />
    </AuthShell>
  )
}
