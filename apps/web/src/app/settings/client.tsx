'use client'

import { Button, Notice } from '@hearthside/ui'
import { Check, Copy, Download, Gift, Mail, Trash2, UserPlus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RecoveryCodes } from '@/components/RecoveryCodes'
import { recipientFromSecret } from '@/lib/backup-key'
import { passkeyBackupSecret } from '@/lib/passkey-prf'
import {
  answerRequestAction,
  approveMemberAction,
  createAppInviteAction,
  dismissRequestAction,
  linkBackupKeyAction,
  revokeAppInviteAction,
  changeRoleAction,
  createInviteAction,
  regenerateCodesAction,
  removeMemberAction,
  removePasskeyAction,
  revokeInviteAction,
} from './actions'

type Outcome = { ok: true } | { ok: false; error: string }

function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  const run = (fn: () => Promise<Outcome>) =>
    start(async () => {
      setError(undefined)
      const result = await fn()
      if (!result.ok) setError(result.error)
    })
  return { pending, error, run }
}

export function InviteCreator() {
  const [role, setRole] = useState<'adult' | 'viewer'>('adult')
  const [url, setUrl] = useState<string>()
  const { pending, error, run } = useAction()
  return (
    <div className="grid gap-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-body-strong">New member can</legend>
        {(
          [
            ['adult', 'Connect accounts and see shared data'],
            ['viewer', 'Only view shared data'],
          ] as const
        ).map(([value, text]) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
            />
            {text}
          </label>
        ))}
      </fieldset>
      <Button
        variant="secondary"
        disabled={pending}
        icon={<UserPlus aria-hidden />}
        className="justify-self-start"
        onClick={() =>
          run(async () => {
            const result = await createInviteAction(role)
            if (result.ok) {
              setUrl(result.url)
            }
            return result
          })
        }
      >
        Create invite link
      </Button>
      {url && <InviteLink url={url} testId="invite-url" />}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

/** A fresh invite link with a copy button. */
function InviteLink({ url, testId }: { url: string; testId: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid gap-2">
      <output
        className="block rounded-md bg-surface-2 px-3 py-2 text-caption break-all"
        data-testid={testId}
      >
        {url}
      </output>
      <Button
        variant="ghost"
        icon={<Copy aria-hidden />}
        className="justify-self-start"
        onClick={async () => {
          await navigator.clipboard?.writeText(url).catch(() => {})
          setCopied(true)
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <p className="text-caption text-ink-muted">Send it privately. It works once, for 7 days.</p>
    </div>
  )
}

export function AppInviteCreator() {
  const [url, setUrl] = useState<string>()
  const { pending, error, run } = useAction()
  return (
    <div className="grid gap-3">
      <Button
        variant="secondary"
        disabled={pending}
        icon={<Gift aria-hidden />}
        className="justify-self-start"
        onClick={() =>
          run(async () => {
            const result = await createAppInviteAction()
            if (result.ok) setUrl(result.url)
            return result
          })
        }
      >
        Create a friend invite link
      </Button>
      {url && <InviteLink url={url} testId="friend-invite-url" />}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

export function RevokeAppInvite({ id }: { id: string }) {
  const { pending, error, run } = useAction()
  return (
    <>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => revokeAppInviteAction(id))}
      >
        Revoke
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}

export function RequestControls({ id }: { id: string }) {
  const [url, setUrl] = useState<string>()
  const { pending, error, run } = useAction()
  if (url) return <InviteLink url={url} testId="request-invite-url" />
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        icon={<Mail aria-hidden />}
        onClick={() =>
          run(async () => {
            const result = await answerRequestAction(id)
            if (result.ok) setUrl(result.url)
            return result
          })
        }
      >
        Create invite
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => dismissRequestAction(id))}
      >
        Dismiss
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

export function RevokeInvite({ id }: { id: string }) {
  const { pending, error, run } = useAction()
  return (
    <>
      <Button variant="ghost" disabled={pending} onClick={() => run(() => revokeInviteAction(id))}>
        Revoke
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}

export function MemberControls({
  id,
  name,
  role,
}: {
  id: string
  name: string
  role: 'adult' | 'viewer'
}) {
  const { pending, error, run } = useAction()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`role-${id}`}>
        Role for {name}
      </label>
      <select
        id={`role-${id}`}
        value={role}
        disabled={pending}
        onChange={(e) => run(() => changeRoleAction(id, e.target.value as 'adult' | 'viewer'))}
        className="min-h-11 rounded-md border border-line bg-surface-2 px-2"
      >
        <option value="adult">Adult</option>
        <option value="viewer">Viewer</option>
      </select>
      {confirming ? (
        <>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => removeMemberAction(id))}
          >
            Remove {name}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          icon={<Trash2 aria-hidden />}
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${name}`}
        >
          Remove
        </Button>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

/** Approve or decline someone who joined by invite. Declining removes them. */
export function PendingControls({ id, name }: { id: string; name: string }) {
  const { pending, error, run } = useAction()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={pending}
        icon={<Check aria-hidden />}
        aria-label={`Approve ${name}`}
        onClick={() => run(() => approveMemberAction(id))}
      >
        Approve
      </Button>
      {confirming ? (
        <>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => removeMemberAction(id))}
          >
            Decline {name}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          variant="ghost"
          disabled={pending}
          icon={<X aria-hidden />}
          aria-label={`Decline ${name}`}
          onClick={() => setConfirming(true)}
        >
          Decline
        </Button>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

export function RemovePasskey({ id, name }: { id: string; name: string }) {
  const { pending, error, run } = useAction()
  return (
    <>
      <Button
        variant="ghost"
        disabled={pending}
        aria-label={`Remove passkey ${name}`}
        onClick={() => run(() => removePasskeyAction(id))}
      >
        Remove
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}

export function RegenerateCodes() {
  const router = useRouter()
  const [codes, setCodes] = useState<string[]>()
  const { pending, error, run } = useAction()
  if (codes) {
    return (
      <RecoveryCodes
        codes={codes}
        doneLabel="Done"
        onDone={() => {
          setCodes(undefined)
          router.refresh()
        }}
      />
    )
  }
  return (
    <>
      <Button
        variant="secondary"
        disabled={pending}
        className="justify-self-start"
        onClick={() =>
          run(async () => {
            const result = await regenerateCodesAction()
            if (result.ok) setCodes(result.codes)
            return result
          })
        }
      >
        Make new codes
      </Button>
      <p className="text-caption text-ink-muted">Your old codes stop working.</p>
      {error && <Notice tone="negative">{error}</Notice>}
    </>
  )
}

/** Makes a fresh encrypted backup and saves it on this device. The server keeps no copy. */
export function DownloadBackup() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/backup', { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'The backup failed. Please try again.')
        return
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
        'hearthside.dump.age'
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      router.refresh()
    } catch {
      setError('The backup failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        variant="secondary"
        disabled={busy}
        icon={<Download aria-hidden />}
        className="justify-self-start"
        onClick={download}
      >
        {busy ? 'Making backup…' : 'Download backup'}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}

/** Turns the owner's passkey into a second key every backup is encrypted to. */
export function LinkPasskeyBackup({ linked }: { linked: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function link() {
    setBusy(true)
    setError(null)
    try {
      const { secret, credentialId } = await passkeyBackupSecret()
      const recipient = await recipientFromSecret(secret)
      secret.fill(0)
      const result = await linkBackupKeyAction({ recipient, credentialId })
      if (!result.ok) setError(result.error)
      else router.refresh()
    } catch (err) {
      setError(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : 'Cancelled')
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    const result = await linkBackupKeyAction(null)
    if (!result.ok) setError(result.error)
    else router.refresh()
    setBusy(false)
  }

  return (
    <div className="grid gap-2">
      {linked ? (
        <Button variant="ghost" disabled={busy} className="justify-self-start" onClick={unlink}>
          Stop using my passkey for backups
        </Button>
      ) : (
        <Button variant="secondary" disabled={busy} className="justify-self-start" onClick={link}>
          Use my passkey to open backups
        </Button>
      )}
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
