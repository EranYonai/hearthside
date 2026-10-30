'use client'

import { Button, Notice } from '@hearthside/ui'
import { Copy, Trash2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RecoveryCodes } from '@/components/RecoveryCodes'
import {
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
  const [copied, setCopied] = useState(false)
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
              setCopied(false)
            }
            return result
          })
        }
      >
        Create invite link
      </Button>
      {url && (
        <div className="grid gap-2">
          <output
            className="block rounded-md bg-surface-2 px-3 py-2 text-caption break-all"
            data-testid="invite-url"
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
          <p className="text-caption text-ink-muted">
            Send it privately. It works once, for 7 days.
          </p>
        </div>
      )}
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
