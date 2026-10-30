'use client'

import { Button } from '@hearthside/ui'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '@/lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="secondary"
      disabled={busy}
      icon={<LogOut aria-hidden />}
      className="justify-self-start"
      onClick={async () => {
        setBusy(true)
        await signOut().catch(() => {})
        router.replace('/login')
        router.refresh()
      }}
    >
      Sign out
    </Button>
  )
}
