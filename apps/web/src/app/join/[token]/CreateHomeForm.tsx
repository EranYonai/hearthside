'use client'

import { Button, Card, Notice, TextField } from '@hearthside/ui'
import { KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { InAppBrowserNotice } from '@/components/InAppBrowserNotice'
import { RecoveryCodes } from '@/components/RecoveryCodes'
import { explain, registerPasskey } from '@/lib/auth-client'

export function CreateHomeForm({ token, inviter }: { token: string; inviter: string }) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [codes, setCodes] = useState<string[]>()

  if (codes) return <RecoveryCodes codes={codes} onDone={() => router.replace('/welcome')} />

  return (
    <Card>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          setBusy(true)
          setError(undefined)
          try {
            const result = await registerPasskey<{ recoveryCodes: string[] }>('join', {
              token,
              householdName: form.get('householdName'),
              name: form.get('name'),
            })
            setCodes(result.recoveryCodes)
          } catch (err) {
            setError(explain(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <InAppBrowserNotice />
        <TextField
          label="Name of your home"
          name="householdName"
          required
          maxLength={60}
          placeholder="Our home"
          autoComplete="off"
        />
        <TextField
          label="Your name"
          name="name"
          required
          maxLength={60}
          autoComplete="given-name"
          hint="This is how people in your home will see you."
        />
        {error && <Notice tone="negative">{error}</Notice>}
        <Button type="submit" block disabled={busy} icon={<KeyRound aria-hidden />}>
          {busy ? 'Waiting for your passkey…' : 'Create passkey and home'}
        </Button>
        <p className="text-caption text-ink-muted">
          Your passkey is saved on this device with Face ID, Touch ID or your PIN. This invite works
          once. Meant to join {inviter}’s home instead? Ask {inviter} for a home invite.
        </p>
      </form>
    </Card>
  )
}
