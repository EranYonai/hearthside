import { Card, Label, Notice } from '@hearthside/ui'
import type { Metadata } from 'next'
import { providerLabel } from '@hearthside/core'
import { AccountCard } from '@/components/AccountCard'
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
        {mine.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="account-list">
            {mine.map((a) => (
              <li key={a.id}>
                <AccountCard
                  name={a.name}
                  kind={a.kind}
                  provider={providerLabel(a.provider)}
                  network={a.network}
                  last4={a.last4}
                  {...(a.visibility === 'private' ? { note: 'Only you' } : {})}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">
            None yet. Import a statement and its account is added for you.
          </p>
        )}
        <details>
          <summary className="cursor-pointer text-body-strong text-brand-ink">
            Add an account by hand
          </summary>
          <div className="pt-3">
            <AccountForm />
          </div>
        </details>
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
