'use client'

import type { Minor } from '@hearthside/core'
import {
  Button,
  Card,
  Notice,
  TextField,
  TransactionList,
  TransactionRow,
  cx,
} from '@hearthside/ui'
import { FileUp, Plus, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { AccountCard } from '@/components/AccountCard'
import { useAction } from '@/lib/use-action'
import { createAccountAction, undoImportAction } from './actions'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

export interface AccountOption {
  id: string
  name: string
  kind: 'card' | 'bank' | 'other'
}

interface Group {
  account: { id: string | null; name: string; isNew: boolean }
  kind: 'card' | 'bank' | 'other'
  provider: string | null
  color: string | null
  network: string | null
  last4: string | null
  total: number
  fresh: number
  duplicates: number
  sample: {
    occurredOn: string
    description: string
    amountMinor: Minor
    original: { minor: Minor; currency: string } | null
    installment: { n: number; total: number } | null
    duplicate: boolean
  }[]
}

interface Preview {
  fileName: string
  groups: Group[]
  skippedCount: number
  skipped: { sheet: string; row: number; reason: string }[]
  alreadyImported: string | null
}

interface Done {
  added: number
  duplicates: number
  accounts: string[]
  month: string | null
}

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

async function post(form: FormData) {
  const res = await fetch('/api/import', { method: 'POST', body: form })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.')
  return body
}

/**
 * Drop a statement (or pick one): the file is checked right away, its account is
 * recognised or created, and one click imports it.
 */
export function ImportForm({
  accounts,
  people = [],
  me,
  logos,
}: {
  accounts: AccountOption[]
  logos?: Partial<Record<string, string>>
  /** Members who can hold a new account; the picker shows when there's more than one. */
  people?: { id: string; name: string }[]
  me?: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [accountId, setAccountId] = useState('')
  const [holderId, setHolderId] = useState(me ?? '')
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const [done, setDone] = useState<Done>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<'check' | 'import'>()

  const send = async (f: File, target: string, commit: boolean) => {
    const form = new FormData()
    form.set('file', f)
    if (target) form.set('accountId', target)
    if (commit) form.set('commit', '1')
    if (commit && holderId) form.set('holderId', holderId)
    setBusy(commit ? 'import' : 'check')
    setError(undefined)
    try {
      const body = await post(form)
      if (commit) {
        setDone(body as unknown as Done)
        setPreview(undefined)
        setFile(undefined)
        setAccountId('')
        if (input.current) input.current.value = ''
        router.refresh()
      } else setPreview(body as unknown as Preview)
    } catch (err) {
      setError((err as Error).message)
      if (!commit) setPreview(undefined)
    } finally {
      setBusy(undefined)
    }
  }

  const pick = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setDone(undefined)
    setAccountId('')
    void send(f, '', false)
  }

  const fresh = preview?.groups.reduce((n, g) => n + g.fresh, 0) ?? 0
  const created = preview?.groups.filter((g) => g.account.isNew).map((g) => g.account.name) ?? []

  return (
    <div className="grid gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pick(e.dataTransfer.files[0])
        }}
        className={cx(
          'grid cursor-pointer place-items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
          dragging ? 'border-brand bg-brand-soft' : 'border-line bg-surface-2',
        )}
      >
        <FileUp size={28} aria-hidden className="text-brand-ink" />
        <span className="text-body-strong">
          {busy === 'check' ? 'Reading…' : file ? file.name : 'Drop a statement here'}
        </span>
        <span className="text-caption text-ink-muted">
          or tap to choose · Excel, CSV or PDF, up to 10 MB · read once, never stored
        </span>
        <input
          ref={input}
          type="file"
          aria-label="Statement file"
          accept=".xlsx,.csv,.xls,.pdf,.txt"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      {error && <Notice tone="negative">{error}</Notice>}

      {preview && file && (
        <div className="grid gap-4" data-testid="import-preview">
          {preview.alreadyImported && (
            <Notice tone="warning">
              You imported this exact file on {day.format(new Date(preview.alreadyImported))}. Its
              rows are already here.
            </Notice>
          )}
          {preview.groups.map((g, i) => (
            <Card key={i} aria-label={`Into ${g.account.name}`}>
              <div className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3">
                <AccountCard
                  name={g.account.name}
                  kind={g.kind}
                  provider={g.provider}
                  color={g.color}
                  logos={logos}
                  network={g.network}
                  last4={g.last4}
                  {...(g.account.isNew ? { note: 'New' } : {})}
                />
                <p>
                  <span className="text-body-strong">{g.fresh} new</span>
                  {g.duplicates > 0 && ` · ${g.duplicates} already here`}
                  <span className="block text-caption text-ink-muted">
                    {g.account.isNew ? `Creates ${g.account.name}` : `Into ${g.account.name}`}
                  </span>
                </p>
              </div>
              <TransactionList>
                {g.sample.map((t, j) => (
                  <TransactionRow
                    key={j}
                    category="other"
                    merchant={t.description}
                    meta={`${t.duplicate ? 'Already here · ' : ''}${day.format(new Date(t.occurredOn))}`}
                    minor={t.amountMinor}
                    {...(t.original ? { original: t.original } : {})}
                    {...(t.installment ? { installment: t.installment } : {})}
                    className={t.duplicate ? 'opacity-60' : undefined}
                  />
                ))}
              </TransactionList>
              {g.total > g.sample.length && (
                <p className="text-caption text-ink-muted">
                  Showing the first {g.sample.length} of {g.total}.
                </p>
              )}
            </Card>
          ))}

          {preview.skipped.length > 0 && (
            <details className="text-caption text-ink-muted">
              <summary>{preview.skippedCount} rows skipped</summary>
              <ul>
                {preview.skipped.map((s) => (
                  <li key={`${s.sheet}-${s.row}`}>
                    {s.sheet}, row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {accounts.length > 0 && (
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">Import into</span>
              <select
                className={selectClass}
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value)
                  void send(file, e.target.value, false)
                }}
              >
                <option value="">Detected automatically</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {created.length > 0 && people.length > 1 && (
            <label className="grid gap-1">
              <span className="text-caption text-ink-muted">Whose is the new account</span>
              <select
                className={selectClass}
                value={holderId}
                onChange={(e) => setHolderId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!!busy || fresh === 0}
              onClick={() => void send(file, accountId, true)}
            >
              {busy === 'import'
                ? 'Importing…'
                : `Import ${fresh} ${fresh === 1 ? 'transaction' : 'transactions'}`}
            </Button>
            {created.length > 0 && (
              <span className="text-caption text-ink-muted">Adds {created.join(', ')}</span>
            )}
          </div>
        </div>
      )}

      {done && (
        <Notice tone="positive">
          Added {done.added} transactions to {done.accounts.join(', ')}
          {done.duplicates > 0 ? `, skipped ${done.duplicates} already here` : ''}.{' '}
          <Link
            className="text-body-strong underline"
            href={done.month ? `/transactions?month=${done.month}` : '/transactions'}
          >
            See transactions
          </Link>
        </Notice>
      )}
    </div>
  )
}

/** For accounts with no statement file yet; most people never need it. */
export function AccountForm() {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountOption['kind']>('card')
  const [visibility, setVisibility] = useState<'household' | 'private'>('household')
  const { pending, error, run } = useAction()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () => createAccountAction({ name, kind, visibility }),
          () => setName(''),
        )
      }}
    >
      <TextField
        label="Account name"
        name="name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Alex’s card"
        autoComplete="off"
      />
      <label className="grid gap-1">
        <span className="text-body-strong">Type</span>
        <select
          className={selectClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountOption['kind'])}
        >
          <option value="card">Card</option>
          <option value="bank">Current account</option>
          <option value="other">Other</option>
        </select>
      </label>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-body-strong">Who can see it</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="visibility"
            checked={visibility === 'household'}
            onChange={() => setVisibility('household')}
          />
          Everyone in the home
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="visibility"
            checked={visibility === 'private'}
            onChange={() => setVisibility('private')}
          />
          Only me
        </label>
      </fieldset>
      {error && <Notice tone="negative">{error}</Notice>}
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        icon={<Plus aria-hidden />}
        className="justify-self-start"
      >
        Add account
      </Button>
    </form>
  )
}

export function UndoImport({ id, label }: { id: string; label: string }) {
  const [confirming, setConfirming] = useState(false)
  const { pending, error, run } = useAction()
  return (
    <span className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => undoImportAction(id))}
          >
            Remove its transactions
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          icon={<Undo2 aria-hidden />}
          aria-label={`Undo import ${label}`}
          onClick={() => setConfirming(true)}
        >
          Undo
        </Button>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
    </span>
  )
}
