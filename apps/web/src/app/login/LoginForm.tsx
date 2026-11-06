'use client'

import { Button, Card, Notice } from '@hearthside/ui'
import { KeyRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { explain, signInWithPasskey } from '@/lib/auth-client'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <Card>
      <Button
        block
        disabled={busy}
        icon={<KeyRound aria-hidden />}
        onClick={async () => {
          setBusy(true)
          setError(undefined)
          try {
            await signInWithPasskey()
            router.replace('/')
            router.refresh()
          } catch (err) {
            setError(explain(err, 'signin'))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Waiting for your passkey…' : 'Sign in with passkey'}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
      <Link href="/recover" className="justify-self-center text-body-strong text-brand-ink">
        Lost your passkey? Use a recovery code
      </Link>
      <p className="text-center text-caption text-ink-muted">
        New here? Hearthside is invite only.{' '}
        <Link href="/" className="text-brand-ink">
          Request an invite
        </Link>{' '}
        or open the link a friend sent you.
      </p>
    </Card>
  )
}
