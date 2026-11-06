import { Card } from '@hearthside/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/AuthShell'
import { requireDb } from '@/lib/db'
import { findOpenAppInvite } from '@/server/app-invites'
import { CreateHomeForm } from './CreateHomeForm'

export const metadata: Metadata = {
  title: 'Create your home · Hearthside',
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

function firstName(name: string) {
  return name.split(' ')[0] ?? name
}

/** A friend invite: the person starts a home of their own. Nothing of the inviter's is shown. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const open = await findOpenAppInvite(requireDb(), token)
  if (!open) {
    return (
      <AuthShell
        title="This invite has expired"
        lead="Invite links work once and for 7 days. Ask your friend for a new one."
      >
        <Card>
          <Link href="/" className="justify-self-center text-body-strong text-brand-ink">
            Go to Hearthside
          </Link>
        </Card>
      </AuthShell>
    )
  }
  const inviter = firstName(open.inviterName)
  return (
    <AuthShell
      title="Create your own home"
      lead={`${inviter} invited you to Hearthside. This starts a new home that’s yours alone: you won’t see ${inviter}’s home, and ${inviter} won’t see yours.`}
    >
      <CreateHomeForm token={token} inviter={inviter} />
    </AuthShell>
  )
}
