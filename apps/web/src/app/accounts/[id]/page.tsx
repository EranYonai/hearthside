import { buttonClasses, Card, Notice } from '@hearthside/ui'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AccountCard } from '@/components/AccountCard'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { canEdit, countAccountTransactions, getVisibleAccount, holderOf } from '@/server/ledger'
import { AuthError, listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { DeleteAccount, EditAccountForm } from './client'
import { listBrandLogos } from '@/server/logos'

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
  const [people, count, logos] = await Promise.all([
    listMembers(db, household.id),
    countAccountTransactions(db, member, account.id),
    listBrandLogos(db, household.id),
  ])
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
            logos={logos}
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
                logos={logos}
                color={account.color}
                network={account.network}
                last4={account.last4}
              />
            </div>
            <Notice tone="info">Only the person who added this account can change it.</Notice>
          </>
        )}
      </Card>
      {mayEdit && (
        <Card aria-label="Delete account">
          <DeleteAccount id={account.id} name={account.name} transactions={count} />
        </Card>
      )}
    </AppShell>
  )
}
