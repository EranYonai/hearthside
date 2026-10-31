import { Card, Label, Notice } from '@hearthside/ui'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { listInvestmentAccounts, mayManage } from '@/server/invest'
import { canEdit, listAccounts, listBatches } from '@/server/ledger'
import { listMembers } from '@/server/repo'
import { requireSession } from '@/server/session'
import { ImportForm, SupportedExports, UndoImport } from './client'

export const metadata: Metadata = { title: 'Import · Hearthside' }
export const dynamic = 'force-dynamic'

const when = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export default async function ImportPage() {
  const { member, household } = await requireSession()
  const db = requireDb()
  if (!canEdit(member)) {
    return (
      <AppShell household={household.name} current="/import">
        <h1 className="font-display text-title">Import</h1>
        <Notice tone="info">Viewers can see transactions but can’t import them.</Notice>
      </AppShell>
    )
  }
  const [accounts, batches, people, investAccounts] = await Promise.all([
    listAccounts(db, member),
    listBatches(db, member),
    listMembers(db, household.id),
    listInvestmentAccounts(db, member),
  ])
  const investable = investAccounts.filter((a) => mayManage(member, a))
  const mine = accounts.filter((a) => a.ownerId === member.id)
  return (
    <AppShell household={household.name} current="/import">
      <h1 className="font-display text-title">Import</h1>

      <Card aria-labelledby="import-title">
        <Label id="import-title">Import a file</Label>
        <ImportForm
          accounts={mine.map(({ id, name, kind }) => ({ id, name, kind }))}
          investAccounts={investable.map(({ id, name }) => ({ id, name }))}
          people={people
            .filter((p) => p.role !== 'viewer')
            .map((p) => ({ id: p.id, name: p.id === member.id ? `${p.name} (you)` : p.name }))}
          me={member.id}
        />
        <SupportedExports />
      </Card>

      <p className="-mt-3 text-caption text-ink-muted">
        Accounts are added for you as you import.{' '}
        <Link href="/accounts" className="text-body-strong text-brand-ink underline">
          See your accounts
        </Link>
      </p>

      {batches.length > 0 && (
        <Card aria-labelledby="history-title">
          <Label id="history-title">Recent imports</Label>
          <ul className="grid divide-y divide-line">
            {batches.map(({ batch, accountName, ownerId }) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <bdi className="text-body-strong">{batch.fileName}</bdi>
                  <span className="block text-caption text-ink-muted">
                    {accountName} · {when.format(batch.createdAt)} · {batch.added} added
                    {batch.duplicates ? `, ${batch.duplicates} already there` : ''}
                  </span>
                </span>
                {(ownerId === member.id || member.role === 'owner') && (
                  <UndoImport id={batch.id} label={batch.fileName} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  )
}
