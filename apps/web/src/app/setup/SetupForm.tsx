'use client'

import { Button, Card, Notice, TextField } from '@hearthside/ui'
import { KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RecoveryCodes } from '@/components/RecoveryCodes'
import { explain, registerPasskey } from '@/lib/auth-client'

export function SetupForm() {
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
            const result = await registerPasskey<{ recoveryCodes: string[] }>('setup', {
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
          hint="This is how others in your home will see you."
        />
        {error && <Notice tone="negative">{error}</Notice>}
        <Button type="submit" block disabled={busy} icon={<KeyRound aria-hidden />}>
          {busy ? 'Waiting for your passkey…' : 'Create passkey'}
        </Button>
        <p className="text-caption text-ink-muted">
          A passkey signs you in with Face ID, Touch ID or your device PIN. There’s no password to
          remember.
        </p>
      </form>
    </Card>
  )
}
