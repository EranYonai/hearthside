'use client'

import { Button, Notice } from '@hearthside/ui'
import { useState } from 'react'

export function RequestInviteForm() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState<string>()
  if (state === 'sent') {
    return (
      <Notice tone="positive">
        Thanks! We’ll email you an invite link when there’s a spot for you.
      </Notice>
    )
  }
  return (
    <form
      className="flex max-w-lg flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const email = new FormData(e.currentTarget).get('email')
        setState('busy')
        setError(undefined)
        const res = await fetch('/api/invite-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        }).catch(() => undefined)
        if (res?.ok) return setState('sent')
        const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
        setError(data?.error ?? 'Something went wrong. Please try again.')
        setState('idle')
      }}
    >
      <label htmlFor="invite-email" className="basis-full text-body-strong">
        Get an invite
      </label>
      <input
        id="invite-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        className="min-h-12 min-w-0 flex-[1_1_240px] rounded-md border border-line bg-surface-1 px-4 text-body"
      />
      <Button type="submit" disabled={state === 'busy'} className="min-h-12">
        {state === 'busy' ? 'Sending…' : 'Request an invite'}
      </Button>
      {error && (
        <div className="basis-full">
          <Notice tone="negative">{error}</Notice>
        </div>
      )}
      <p className="basis-full text-caption text-ink-muted">
        We only use your email to send the invite. Got a link from a friend? Just open it.
      </p>
    </form>
  )
}
