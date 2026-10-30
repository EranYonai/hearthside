'use client'

import { Button, Card, Notice, TextField } from '@hearthside/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { explain, submitRecoveryCode } from '@/lib/auth-client'

export function RecoverForm() {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          const code = String(new FormData(e.currentTarget).get('code') ?? '')
          setBusy(true)
          setError(undefined)
          try {
            await submitRecoveryCode(code)
            router.replace('/recovered')
          } catch (err) {
            setError(explain(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <TextField
          label="Recovery code"
          name="code"
          required
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX"
        />
        {error && <Notice tone="negative">{error}</Notice>}
        <Button type="submit" block disabled={busy}>
          Continue
        </Button>
        <Link href="/login" className="justify-self-center text-body-strong text-brand-ink">
          Back to sign in
        </Link>
      </form>
    </Card>
  )
}
