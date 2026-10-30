'use client'

import type { Minor } from '@hearthside/core'
import {
  Button,
  Card,
  Label,
  Notice,
  TextField,
  TransactionList,
  TransactionRow,
} from '@hearthside/ui'
import { FileUp, Plus, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useAction } from '@/lib/use-action'
import { createAccountAction, undoImportAction } from './actions'

const selectClass = 'min-h-11 w-full rounded-md border border-line bg-surface-2 px-3'

export interface AccountOption {
  id: string
  name: string
  kind: 'card' | 'bank' | 'other'
}

interface Preview {
  total: number
  fresh: number
  duplicates: number
  skippedCount: number
  skipped: { sheet: string; row: number; reason: string }[]
  alreadyImported: string | null
  sample: {
    occurredOn: string
    description: string
    amountMinor: Minor
    original: { minor: Minor; currency: string } | null
    installment: { n: number; total: number } | null
    duplicate: boolean
  }[]
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

export function ImportForm({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter()
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [file, setFile] = useState<File>()
  const [flip, setFlip] = useState(false)
  const [preview, setPreview] = useState<Preview>()
  const [done, setDone] = useState<{ added: number; duplicates: number; month: string | null }>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const send = async (commit: boolean, flipSigns = flip) => {
    if (!file || !accountId) return
    const form = new FormData()
    form.set('accountId', accountId)
    form.set('file', file)
    if (flipSigns) form.set('flip', '1')
    if (commit) form.set('commit', '1')
    setBusy(true)
    setError(undefined)
    try {
      const body = await post(form)
      if (commit) {
        const { batch, month } = body as {
          batch: { added: number; duplicates: number }
          month: string | null
        }
        setDone({ added: batch.added, duplicates: batch.duplicates, month })
        setPreview(undefined)
        router.refresh()
      } else setPreview(body as Preview)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (accounts.length === 0)
    return <p className="text-ink-muted">Add an account below first, then import its statement.</p>

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setDone(undefined)
          void send(false)
        }}
      >
        <label className="grid gap-1">
          <span className="text-body-strong">Account</span>
          <select
            className={selectClass}
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value)
              setPreview(undefined)
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-body-strong">Statement file</span>
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.csv,.xls,.pdf,.txt"
            className="min-h-11 rounded-md border border-line bg-surface-2 px-3 py-2 file:me-3 file:rounded-sm file:border-0 file:bg-surface-1 file:px-2"
            onChange={(e) => {
              setFile(e.target.files?.[0])
              setPreview(undefined)
              setDone(undefined)
            }}
          />
          <span className="text-caption text-ink-muted">
            Excel (.xlsx), CSV or a text PDF, up to 10 MB. The file is read and then thrown away.
          </span>
        </label>
        <Button
          type="submit"
          disabled={busy || !file}
          icon={<FileUp aria-hidden />}
          className="justify-self-start"
        >
          {busy && !preview ? 'Reading…' : 'Check file'}
        </Button>
      </form>

      {error && <Notice tone="negative">{error}</Notice>}

      {preview && (
        <Card aria-labelledby="preview-title" data-testid="import-preview">
          <Label id="preview-title">Preview</Label>
          <p>
            <span className="text-body-strong">{preview.fresh} new</span>
            {preview.duplicates > 0 && ` · ${preview.duplicates} already here`}
            {preview.skippedCount > 0 && ` · ${preview.skippedCount} rows skipped`}
          </p>
          {preview.alreadyImported && (
            <Notice tone="warning">
              You imported this exact file on {day.format(new Date(preview.alreadyImported))}. Its
              rows are already here.
            </Notice>
          )}
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={flip}
              onChange={(e) => {
                setFlip(e.target.checked)
                void send(false, e.target.checked)
              }}
            />
            Spending shows as money in. Flip the signs.
          </label>
          <TransactionList>
            {preview.sample.map((t, i) => (
              <TransactionRow
                key={i}
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
          {preview.total > preview.sample.length && (
            <p className="text-caption text-ink-muted">
              Showing the first {preview.sample.length} of {preview.total}.
            </p>
          )}
          {preview.skipped.length > 0 && (
            <details className="text-caption text-ink-muted">
              <summary>Skipped rows</summary>
              <ul>
                {preview.skipped.map((s) => (
                  <li key={`${s.sheet}-${s.row}`}>
                    {s.sheet}, row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button
            disabled={busy || preview.fresh === 0}
            onClick={() => void send(true)}
            className="justify-self-start"
          >
            {busy ? 'Importing…' : `Import ${preview.fresh} transactions`}
          </Button>
        </Card>
      )}

      {done && (
        <Notice tone="positive">
          Added {done.added} transactions
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
          <option value="card">Card (purchases listed as positive amounts)</option>
          <option value="bank">Current account (money out listed as debit or negative)</option>
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
