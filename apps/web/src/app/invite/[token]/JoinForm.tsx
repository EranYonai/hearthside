'use client'

import { Button, Card, Notice, TextField } from '@hearthside/ui'
import { KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { RecoveryCodes } from '@/components/RecoveryCodes'
import { explain, registerPasskey } from '@/lib/auth-client'

export function JoinForm({ token }: { token: string }) {
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
          const name = new FormData(e.currentTarget).get('name')
          setBusy(true)
          setError(undefined)
          try {
            const result = await registerPasskey<{ recoveryCodes: string[] }>('invite', {
              token,
              name,
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
          label="Your name"
          name="name"
          required
          maxLength={60}
          autoComplete="given-name"
        />
        {error && <Notice tone="negative">{error}</Notice>}
        <Button type="submit" block disabled={busy} icon={<KeyRound aria-hidden />}>
          {busy ? 'Waiting for your passkey…' : 'Create passkey and join'}
        </Button>
      </form>
    </Card>
  )
}
