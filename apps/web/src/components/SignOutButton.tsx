'use client'

import { Button } from '@hearthside/ui'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/lib/auth-client'

/** Full button in Settings; `compact` is the icon-only one in the header. */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={compact ? 'ghost' : 'secondary'}
      disabled={busy}
      icon={<LogOut aria-hidden />}
      aria-label={compact ? 'Sign out' : undefined}
      title={compact ? 'Sign out' : undefined}
      className={compact ? undefined : 'justify-self-start'}
      onClick={async () => {
        setBusy(true)
        await signOut().catch(() => {})
        router.replace('/login')
        router.refresh()
      }}
    >
      {compact ? null : 'Sign out'}
    </Button>
  )
}
