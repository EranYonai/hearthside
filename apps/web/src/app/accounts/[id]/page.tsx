import { buttonClasses, Card, Notice } from '@hearthside/ui'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AccountCard } from '@/components/AccountCard'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { canEdit, getVisibleAccount, holderOf } from '@/server/ledger'
import { AuthError, listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { EditAccountForm } from './client'

export const metadata: Metadata = { title: 'Account · Hearthside' }
export const dynamic = 'force-dynamic'

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { member, household } = await requireSession()
  const db = requireDb()
  const { id } = await params
  const account = await getVisibleAccount(db, member, id).catch((err: unknown) => {
    if (err instanceof AuthError) notFound()
    throw err
  })
  const people = await listMembers(db, household.id)
  const mayEdit = canEdit(member) && (account.ownerId === member.id || member.role === 'owner')

  return (
    <AppShell household={household.name} current="/accounts">
      <Link href="/accounts" className={`${buttonClasses('ghost')} justify-self-start`}>
        <ChevronLeft aria-hidden />
        Accounts
      </Link>
      <h1 className="font-display text-title">{account.name}</h1>
      <Card>
        {mayEdit ? (
          <EditAccountForm
            id={account.id}
            name={account.name}
            kind={account.kind}
            provider={account.provider}
            color={account.color}
            network={account.network}
            last4={account.last4}
            holderId={holderOf(account)}
            visibility={account.visibility}
            people={people
              .filter((p) => p.role !== 'viewer' || p.id === holderOf(account))
              .map((p) => ({ id: p.id, name: p.id === member.id ? `${p.name} (you)` : p.name }))}
          />
        ) : (
          <>
            <div className="max-w-64">
              <AccountCard
                name={account.name}
                kind={account.kind}
                provider={account.provider}
                color={account.color}
                network={account.network}
                last4={account.last4}
              />
            </div>
            <Notice tone="info">Only the person who added this account can change it.</Notice>
          </>
        )}
      </Card>
    </AppShell>
  )
}
