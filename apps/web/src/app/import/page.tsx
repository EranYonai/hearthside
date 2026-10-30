import { Card, Label, Notice } from '@hearthside/ui'
import type { Metadata } from 'next'
import { AppShell } from '@/components/AppShell'
import { requireDb } from '@/lib/db'
import { canEdit, listAccounts, listBatches } from '@/server/ledger'
import { requireSession } from '@/server/session'
import { AccountForm, ImportForm, UndoImport } from './client'

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
  const [accounts, batches] = await Promise.all([listAccounts(db, member), listBatches(db, member)])
  const mine = accounts.filter((a) => a.ownerId === member.id)
  return (
    <AppShell household={household.name} current="/import">
      <h1 className="font-display text-title">Import</h1>

      <Card aria-labelledby="import-title">
        <Label id="import-title">Import a statement</Label>
        <ImportForm accounts={mine.map(({ id, name, kind }) => ({ id, name, kind }))} />
      </Card>

      <Card aria-labelledby="accounts-title">
        <Label id="accounts-title">Your accounts</Label>
        {mine.length > 0 && (
          <ul className="grid divide-y divide-line" data-testid="account-list">
            {mine.map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-body-strong">{a.name}</span>
                <span className="block text-caption text-ink-muted">
                  {a.kind === 'card' ? 'Card' : a.kind === 'bank' ? 'Current account' : 'Other'} ·{' '}
                  {a.visibility === 'private' ? 'Only you' : 'Everyone in the home'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <AccountForm />
      </Card>

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
