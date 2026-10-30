'use client'

import { Button, Notice, type ButtonVariant } from '@hearthside/ui'
import { KeyRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { explain, registerPasskey } from '@/lib/auth-client'

export function AddPasskeyButton({
  variant = 'secondary',
  after,
}: {
  variant?: ButtonVariant
  after?: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <div className="grid gap-2">
      <Button
        variant={variant}
        disabled={busy}
        icon={<KeyRound aria-hidden />}
        onClick={async () => {
          setBusy(true)
          setError(undefined)
          try {
            await registerPasskey('passkeys')
            if (after) router.replace(after)
            router.refresh()
          } catch (err) {
            setError(explain(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Waiting for your passkey…' : 'Add a passkey'}
      </Button>
      {error && <Notice tone="negative">{error}</Notice>}
    </div>
  )
}
