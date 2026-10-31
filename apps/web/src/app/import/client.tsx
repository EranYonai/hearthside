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
  type: 'statement'
  fileName: string
  groups: Group[]
  skippedCount: number
  skipped: { sheet: string; row: number; reason: string }[]
  alreadyImported: string | null
}

interface HoldingsPreview {
  type: 'holdings'
  fileName: string
  account: { id: string | null; name: string; isNew: boolean }
  provider: string | null
  currency: string
  holdings: {
    symbol: string
    name: string
    units: string
    price: string | null
    currency: string | null
  }[]
  total: number
  skipped: { row: number; reason: string }[]
  skippedCount: number
  priceInHundredths: boolean
}

type Done =
  | {
      type: 'statement'
      added: number
      duplicates: number
      accounts: string[]
      month: string | null
    }
  | {
      type: 'holdings'
      added: number
      updated: number
      removed: number
      account: { id: string; name: string }
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
 * Drop any supported file (or pick one): a statement or a holdings export. The file is
 * checked right away, its account is recognised or created, and one click imports it.
 */
export function ImportForm({
  accounts,
  investAccounts = [],
  people = [],
  me,
}: {
  accounts: AccountOption[]
  /** Investment accounts the member may change, for holdings files. */
  investAccounts?: { id: string; name: string }[]
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
  const [preview, setPreview] = useState<Preview | HoldingsPreview>()
  const [removeMissing, setRemoveMissing] = useState(true)
  const [done, setDone] = useState<Done>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<'check' | 'import'>()

  const send = async (f: File, target: string, commit: boolean) => {
    const form = new FormData()
    form.set('file', f)
    if (target) form.set('accountId', target)
    if (commit) form.set('commit', '1')
    if (commit && holderId) form.set('holderId', holderId)
    if (commit && !removeMissing) form.set('removeMissing', '0')
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

  const statement = preview?.type === 'statement' ? preview : undefined
  const held = preview?.type === 'holdings' ? preview : undefined
  const fresh = statement?.groups.reduce((n, g) => n + g.fresh, 0) ?? 0
  const created = statement
    ? statement.groups.filter((g) => g.account.isNew).map((g) => g.account.name)
    : held?.account.isNew
      ? [held.account.name]
      : []
  const targets = held ? investAccounts : accounts

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
          {busy === 'check' ? 'Reading…' : file ? file.name : 'Drop a file here'}
        </span>
        <span className="text-caption text-ink-muted">
          Statements or investment holdings · or tap to choose · Excel, CSV or PDF, up to 10 MB ·
          read once, never stored
        </span>
        <input
          ref={input}
          type="file"
          aria-label="File to import"
          accept=".xlsx,.csv,.xls,.html,.htm,.pdf,.txt"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>

      {error && <Notice tone="negative">{error}</Notice>}

      {preview && file && (
        <div className="grid gap-4" data-testid="import-preview">
          {statement?.alreadyImported && (
            <Notice tone="warning">
              You imported this exact file on {day.format(new Date(statement.alreadyImported))}. Its
              rows are already here.
            </Notice>
          )}
          {held && <HoldingsCard preview={held} />}
          {statement?.groups.map((g, i) => (
            <Card key={i} aria-label={`Into ${g.account.name}`}>
              <div className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3">
                <AccountCard
                  name={g.account.name}
                  kind={g.kind}
                  provider={g.provider}
                  color={g.color}
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
                  <li key={`${'sheet' in s ? s.sheet : ''}-${s.row}`}>
                    {'sheet' in s ? `${s.sheet}, ` : ''}row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {held && !held.account.isNew && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={removeMissing}
                onChange={(e) => setRemoveMissing(e.target.checked)}
              />
              Remove imported holdings that aren’t in this file (sold)
            </label>
          )}

          {targets.length > 0 && (
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
                {targets.map((a) => (
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
              disabled={!!busy || (statement ? fresh === 0 : !held?.total)}
              onClick={() => void send(file, accountId, true)}
            >
              {busy === 'import'
                ? 'Importing…'
                : held
                  ? `Import ${held.total} ${held.total === 1 ? 'holding' : 'holdings'}`
                  : `Import ${fresh} ${fresh === 1 ? 'transaction' : 'transactions'}`}
            </Button>
            {created.length > 0 && (
              <span className="text-caption text-ink-muted">Adds {created.join(', ')}</span>
            )}
          </div>
        </div>
      )}

      {done?.type === 'holdings' && (
        <Notice tone="positive">
          {done.account.name}: added {done.added}, updated {done.updated}, removed {done.removed}.{' '}
          <Link className="text-body-strong underline" href={`/invest/${done.account.id}`}>
            See holdings
          </Link>
        </Notice>
      )}

      {done?.type === 'statement' && (
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

function HoldingsCard({ preview }: { preview: HoldingsPreview }) {
  return (
    <Card aria-label={`Into ${preview.account.name}`}>
      <div className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3">
        <AccountCard
          name={preview.account.name}
          kind="investment"
          provider={preview.provider}
          color={null}
          network={null}
          last4={null}
          {...(preview.account.isNew ? { note: 'New' } : {})}
        />
        <p>
          <span className="text-body-strong">
            {preview.total} {preview.total === 1 ? 'holding' : 'holdings'}
          </span>
          <span className="block text-caption text-ink-muted">
            {preview.account.isNew
              ? `Creates investment account ${preview.account.name} (${preview.currency})`
              : `Into ${preview.account.name}`}
          </span>
        </p>
      </div>
      {preview.priceInHundredths && (
        <Notice tone="info">Prices in the file were in agorot and were turned into shekels.</Notice>
      )}
      <ul className="grid gap-1 text-caption" data-testid="holdings-preview">
        {preview.holdings.map((h) => (
          <li key={h.symbol} className="flex justify-between gap-2">
            <span className="truncate">
              <bdi>{h.name}</bdi> <span className="text-ink-muted">{h.symbol}</span>
            </span>
            <span className="whitespace-nowrap tabular-nums">
              {h.units}
              {h.price ? ` × ${h.price} ${h.currency}` : ''}
            </span>
          </li>
        ))}
      </ul>
      {preview.total > preview.holdings.length && (
        <p className="text-caption text-ink-muted">
          Showing the first {preview.holdings.length} of {preview.total}.
        </p>
      )}
    </Card>
  )
}

/** A short list of the exports the import box recognises. */
export function SupportedExports() {
  return (
    <details className="text-caption text-ink-muted">
      <summary className="cursor-pointer">What can I import?</summary>
      <ul className="mt-2 grid list-disc gap-1 ps-5">
        <li>Card exports from Max, Cal, Isracard, American Express and Diners (Excel or CSV).</li>
        <li>
          Bank statements from Hapoalim (PDF or Excel), and from Leumi, Discount, Mizrahi Tefahot
          and other banks when the export has date, description and debit/credit columns.
        </li>
        <li>
          Investment holdings from brokers and investment houses, like Interactive Brokers, Meitav,
          Altshuler Shaham, Psagot or IBI (Excel or CSV with a symbol or security number and a
          quantity per row).
        </li>
      </ul>
      <p className="mt-2">
        We spot what the file is and add the account for you. If something isn’t recognised, any
        export with clear column headers usually works.
      </p>
    </details>
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
